from datetime import date, time
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from openpyxl import load_workbook
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, is_cointra_admin
from app.db.session import get_db
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import UserRole
from app.models.enums import ItemTipo
from app.models.catalogo_tarifa import CatalogoTarifa
from app.models.operacion import Operacion
from app.models.servicio import Servicio
from app.models.usuario import Usuario
from app.models.usuario_operacion import usuario_operaciones_asignadas
from app.models.vehiculo import Vehiculo
from app.models.viaje import Viaje
from app.schemas.viaje import CargaMasivaResultado, ViajeCreate, ViajeOut, ViajeUpdate
from app.services.pricing import calculate_tarifa_cliente

router = APIRouter(prefix="/viajes", tags=["viajes"])


def _estado_conciliacion_valor(viaje: Viaje) -> str | None:
    if viaje.estado_conciliacion:
        return viaje.estado_conciliacion
    if not viaje.conciliacion:
        return None
    estado = viaje.conciliacion.estado
    return getattr(estado, "value", estado)


def _expected_conciliado(viaje: Viaje) -> bool:
    estado = _estado_conciliacion_valor(viaje)
    if estado is None:
        return False
    return estado in {"APROBADA", "CERRADA"}


def _validate_user_access_operacion(user: Usuario, operacion: Operacion) -> None:
    if user.rol == UserRole.CLIENTE:
        is_assigned = any(op.id == operacion.id for op in user.operaciones_asignadas)
        if not is_assigned:
            raise HTTPException(status_code=403, detail="Operacion no disponible para este cliente")
    if user.rol == UserRole.TERCERO and user.tercero_id != operacion.tercero_id:
        raise HTTPException(status_code=403, detail="Operacion no disponible para este tercero")


def _ensure_cointra_admin(user: Usuario) -> None:
    if not is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo COINTRA_ADMIN puede editar o inactivar viajes")


def _is_viaje_or_extra(servicio: Servicio | None) -> bool:
    if not servicio:
        return True
    return servicio.codigo in {"VIAJE", "VIAJE_ADICIONAL"}


def _is_hora_extra(servicio: Servicio | None) -> bool:
    if not servicio:
        return False
    return servicio.codigo == "HORA_EXTRA"


def _needs_origen_destino(servicio: Servicio | None) -> bool:
    """Retorna True si el servicio requiere origen y destino en formulario"""
    if not servicio:
        return True  # por defecto, si no hay servicio, se trata como viaje
    return servicio.requiere_origen_destino


def _calculate_horas_hasta_corte(hora_inicio: time, corte: time = time(6, 0)) -> float:
    start_minutes = hora_inicio.hour * 60 + hora_inicio.minute
    end_minutes = corte.hour * 60 + corte.minute
    if start_minutes >= end_minutes:
        raise HTTPException(status_code=400, detail="La hora inicio para Hora Extra debe ser anterior a las 06:00")
    return round((end_minutes - start_minutes) / 60, 2)


@router.post("", response_model=ViajeOut)
def create_viaje(
    payload: ViajeCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Crear viajes: COINTRA_ADMIN, COINTRA_USER, TERCERO
    if user.rol == UserRole.TERCERO:
        allowed = True
    elif user.rol == UserRole.COINTRA:
        # Cualquier sub_rol de Cointra puede crear viajes
        allowed = True
    else:
        allowed = False

    if not allowed:
        raise HTTPException(status_code=403, detail="No tiene permisos para crear viajes")

    operacion = db.get(Operacion, payload.operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    _validate_user_access_operacion(user, operacion)

    servicio = None
    if payload.servicio_id is not None:
        servicio = db.get(Servicio, payload.servicio_id)
        if not servicio or not servicio.activo:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")

    placa = payload.placa.strip().upper()
    
    origen = payload.origen.strip() if payload.origen and payload.origen.strip() else ""
    destino = payload.destino.strip() if payload.destino and payload.destino.strip() else ""

    # Validar que origen y destino estén presentes si el servicio así lo requiere
    if _needs_origen_destino(servicio):
        if not origen:
            raise HTTPException(status_code=400, detail="Origen es obligatorio para este servicio")
        if not destino:
            raise HTTPException(status_code=400, detail="Destino es obligatorio para este servicio")
    else:
        origen = origen or "N/A"
        destino = destino or "N/A"
    
    tarifa_tercero = float(payload.tarifa_tercero or 0)
    tarifa_cliente = float(payload.tarifa_cliente or 0)
    rentabilidad = None
    hora_inicio = payload.hora_inicio
    hora_fin = None
    horas_cantidad = None

    if not _is_viaje_or_extra(servicio):
        vehiculo = db.query(Vehiculo).filter(Vehiculo.placa == placa, Vehiculo.activo.is_(True)).first()
        if not vehiculo:
            raise HTTPException(status_code=400, detail="La placa seleccionada no tiene vehiculo activo")

        tarifa_catalogo = (
            db.query(CatalogoTarifa)
            .filter(
                CatalogoTarifa.servicio_id == servicio.id,
                CatalogoTarifa.tipo_vehiculo_id == vehiculo.tipo_vehiculo_id,
                CatalogoTarifa.activo.is_(True),
            )
            .first()
        )
        factor = 1.0
        if _is_hora_extra(servicio):
            if not hora_inicio:
                raise HTTPException(status_code=400, detail="Hora inicio es obligatoria para servicio Hora Extra")
            hora_fin = time(6, 0)
            horas_cantidad = _calculate_horas_hasta_corte(hora_inicio, hora_fin)
            factor = float(horas_cantidad)
        else:
            hora_inicio = None
            hora_fin = None
            horas_cantidad = 1.0

        if tarifa_catalogo:
            tarifa_tercero = round(float(tarifa_catalogo.tarifa_tercero) * factor, 2)
            tarifa_cliente = round(float(tarifa_catalogo.tarifa_cliente) * factor, 2)
            rentabilidad = float(tarifa_catalogo.rentabilidad_pct)
        else:
            tarifa_manual_tercero = float(payload.tarifa_tercero or 0)
            tarifa_manual_cliente = float(payload.tarifa_cliente or 0)
            if tarifa_manual_tercero <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="No hay tarifa parametrizada para ese servicio y tipo de vehiculo. Debes ingresar tarifa manual.",
                )

            if tarifa_manual_cliente <= 0:
                tarifa_manual_cliente, rentabilidad = calculate_tarifa_cliente(tarifa_manual_tercero, operacion)
            else:
                if tarifa_manual_cliente > 0:
                    rentabilidad = round((1 - (tarifa_manual_tercero / tarifa_manual_cliente)) * 100, 2)

            tarifa_tercero = round(tarifa_manual_tercero * factor, 2)
            tarifa_cliente = round(float(tarifa_manual_cliente) * factor, 2)

    if _is_viaje_or_extra(servicio) and tarifa_tercero and not tarifa_cliente:
        tarifa_cliente, rentabilidad = calculate_tarifa_cliente(float(tarifa_tercero), operacion)

    viaje = Viaje(
        operacion_id=payload.operacion_id,
        tercero_id=operacion.tercero_id,
        servicio_id=servicio.id if servicio else None,
        titulo=payload.titulo.strip(),
        fecha_servicio=payload.fecha_servicio,
        origen=origen,
        destino=destino,
        placa=placa,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        horas_cantidad=horas_cantidad,
        conductor=payload.conductor,
        tarifa_tercero=tarifa_tercero,
        tarifa_cliente=tarifa_cliente,
        rentabilidad=rentabilidad,
        manifiesto_numero=payload.manifiesto_numero,
        descripcion=payload.descripcion,
        created_by=user.id,
        cargado_por=user.rol.value,
        estado_conciliacion=None,
        activo=True,
    )

    db.add(viaje)
    db.commit()
    db.refresh(viaje)
    return viaje


@router.get("", response_model=list[dict])
def list_viajes(
    operacion_id: int | None = None,
    only_pending: bool = False,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    query = (
        db.query(Viaje)
        .join(Operacion, Operacion.id == Viaje.operacion_id)
        .options(selectinload(Viaje.conciliacion), selectinload(Viaje.servicio))
    )
    if not is_cointra_admin(user):
        query = query.filter(Viaje.activo.is_(True))
    if user.rol == UserRole.CLIENTE:
        query = query.join(
            usuario_operaciones_asignadas,
            usuario_operaciones_asignadas.c.operacion_id == Operacion.id,
        ).filter(usuario_operaciones_asignadas.c.usuario_id == user.id)
    if user.rol == UserRole.TERCERO and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id)
    if operacion_id:
        query = query.filter(Viaje.operacion_id == operacion_id)
    if only_pending:
        query = query.filter(Viaje.conciliado.is_(False))

    viajes = query.order_by(Viaje.id.desc()).all()

    changed = False

    # Repara enlaces historicos: item VIAJE existente sin viaje.conciliacion_id sincronizado.
    viaje_ids = [v.id for v in viajes]
    item_conciliacion_by_viaje_id: dict[int, int] = {}
    item_snapshot_by_viaje_id: dict[int, ConciliacionItem] = {}
    if viaje_ids:
        item_rows = (
            db.query(ConciliacionItem)
            .filter(
                ConciliacionItem.tipo == ItemTipo.VIAJE,
                ConciliacionItem.viaje_id.in_(viaje_ids),
                ConciliacionItem.viaje_id.is_not(None),
            )
            .order_by(ConciliacionItem.id.desc())
            .all()
        )
        for row in item_rows:
            viaje_id = row.viaje_id
            conciliacion_id = row.conciliacion_id
            if viaje_id is None:
                continue
            if viaje_id not in item_conciliacion_by_viaje_id:
                item_conciliacion_by_viaje_id[viaje_id] = conciliacion_id
                item_snapshot_by_viaje_id[viaje_id] = row

    conciliacion_ids_from_items = set(item_conciliacion_by_viaje_id.values())
    conciliaciones_map: dict[int, str] = {}
    if conciliacion_ids_from_items:
        conciliaciones = (
            db.query(Conciliacion.id, Conciliacion.estado)
            .filter(Conciliacion.id.in_(conciliacion_ids_from_items))
            .all()
        )
        conciliaciones_map = {cid: getattr(estado, "value", estado) for cid, estado in conciliaciones}

    for viaje in viajes:
        recovered_conciliacion_id = item_conciliacion_by_viaje_id.get(viaje.id)
        effective_conciliacion_id = viaje.conciliacion_id or recovered_conciliacion_id
        if viaje.conciliacion_id is None and recovered_conciliacion_id is not None:
            viaje.conciliacion_id = recovered_conciliacion_id
            changed = True

        estado_actual = _estado_conciliacion_valor(viaje)
        if estado_actual is None and effective_conciliacion_id is not None:
            estado_actual = conciliaciones_map.get(effective_conciliacion_id)

        esperado = _expected_conciliado(viaje)
        if estado_actual is not None:
            esperado = estado_actual in {"APROBADA", "CERRADA"}

        if viaje.conciliado != esperado:
            viaje.conciliado = esperado
            changed = True
        if viaje.estado_conciliacion != estado_actual:
            viaje.estado_conciliacion = estado_actual
            changed = True

    if changed:
        db.commit()

    payload: list[dict] = []
    for viaje in viajes:
        effective_estado = viaje.estado_conciliacion
        if user.rol == UserRole.CLIENTE and effective_estado not in {"EN_REVISION", "APROBADA", "CERRADA"}:
            continue

        out = ViajeOut.model_validate(viaje).model_dump()
        item_snapshot = item_snapshot_by_viaje_id.get(viaje.id)
        if item_snapshot:
            if item_snapshot.tarifa_tercero is not None:
                out["tarifa_tercero"] = float(item_snapshot.tarifa_tercero)
            if item_snapshot.tarifa_cliente is not None:
                out["tarifa_cliente"] = float(item_snapshot.tarifa_cliente)
            if item_snapshot.rentabilidad is not None:
                out["rentabilidad"] = float(item_snapshot.rentabilidad)

        if viaje.conciliacion_id is None and viaje.id in item_conciliacion_by_viaje_id:
            out["conciliacion_id"] = item_conciliacion_by_viaje_id[viaje.id]
        out["estado_conciliacion"] = effective_estado
        out["servicio_nombre"] = viaje.servicio.nombre if viaje.servicio else None
        out["servicio_codigo"] = viaje.servicio.codigo if viaje.servicio else None

        # Seguridad por API: cada rol solo recibe los valores financieros que le corresponden.
        if user.rol == UserRole.CLIENTE:
            out["tarifa_tercero"] = None
            out["rentabilidad"] = None
        elif user.rol == UserRole.TERCERO:
            out["tarifa_cliente"] = None
            out["rentabilidad"] = None

        payload.append(out)

    return payload


@router.patch("/{viaje_id}", response_model=ViajeOut)
def update_viaje(
    viaje_id: int,
    payload: ViajeUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    viaje = db.get(Viaje, viaje_id)
    if not viaje:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No se enviaron cambios")

    if "tarifa_tercero" in data and data.get("tarifa_tercero") is not None:
        operacion = db.get(Operacion, viaje.operacion_id)
        tarifa_tercero = float(data["tarifa_tercero"])
        if "tarifa_cliente" not in data or data.get("tarifa_cliente") in (None, 0):
            tarifa_cliente, rentabilidad = calculate_tarifa_cliente(tarifa_tercero, operacion)
            data["tarifa_cliente"] = tarifa_cliente
            data["rentabilidad"] = rentabilidad

    for field, value in data.items():
        setattr(viaje, field, value)

    db.commit()
    db.refresh(viaje)
    return viaje


@router.delete("/{viaje_id}")
def deactivate_viaje(
    viaje_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    viaje = db.get(Viaje, viaje_id)
    if not viaje:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    viaje.activo = False
    db.commit()
    return {"ok": True}


@router.post("/{viaje_id}/reactivar")
def reactivate_viaje(
    viaje_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    viaje = db.get(Viaje, viaje_id)
    if not viaje:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    viaje.activo = True
    db.commit()
    return {"ok": True}


@router.post("/carga-masiva", response_model=CargaMasivaResultado)
async def bulk_upload_viajes(
    operacion_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Carga masiva de viajes: mismos permisos que crear viaje
    if user.rol == UserRole.TERCERO:
        allowed = True
    elif user.rol == UserRole.COINTRA:
        allowed = True
    else:
        allowed = False

    if not allowed:
        raise HTTPException(status_code=403, detail="No tiene permisos para cargar viajes")

    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    _validate_user_access_operacion(user, operacion)

    content = await file.read()
    wb = load_workbook(filename=BytesIO(content), data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Archivo Excel vacio")

    headers = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    expected = {
        "titulo",
        "fecha_servicio",
        "origen",
        "destino",
        "placa",
        "tarifa_tercero",
    }
    missing = [h for h in expected if h not in headers]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columnas faltantes: {', '.join(missing)}")

    idx = {name: headers.index(name) for name in headers if name}
    errores: list[str] = []
    cargados = 0

    for row_num, row in enumerate(rows[1:], start=2):
        try:
            titulo = (row[idx["titulo"]] or "").strip() if row[idx["titulo"]] else ""
            fecha_val = row[idx["fecha_servicio"]]
            origen = (row[idx["origen"]] or "").strip() if row[idx["origen"]] else ""
            destino = (row[idx["destino"]] or "").strip() if row[idx["destino"]] else ""
            placa = (row[idx["placa"]] or "").strip() if row[idx["placa"]] else ""
            conductor = ""
            if "conductor" in idx and row[idx["conductor"]]:
                conductor = (row[idx["conductor"]] or "").strip()
            tarifa_tercero = row[idx["tarifa_tercero"]]

            if not all([titulo, fecha_val, origen, destino, placa, tarifa_tercero]):
                raise ValueError("faltan campos obligatorios")

            fecha_servicio = fecha_val if isinstance(fecha_val, date) else date.fromisoformat(str(fecha_val))
            tarifa_tercero_num = float(tarifa_tercero)

            viaje = Viaje(
                operacion_id=operacion_id,
                tercero_id=operacion.tercero_id,
                titulo=titulo,
                fecha_servicio=fecha_servicio,
                origen=origen,
                destino=destino,
                placa=placa,
                conductor=conductor or None,
                tarifa_tercero=tarifa_tercero_num,
                created_by=user.id,
                cargado_por=user.rol.value,
            )
            viaje.tarifa_cliente, viaje.rentabilidad = calculate_tarifa_cliente(tarifa_tercero_num, operacion)
            db.add(viaje)
            cargados += 1
        except Exception as exc:
            errores.append(f"Fila {row_num}: {exc}")

    db.commit()
    return CargaMasivaResultado(total_filas=max(0, len(rows) - 1), cargados=cargados, errores=errores)
