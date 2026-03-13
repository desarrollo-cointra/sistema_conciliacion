from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.schemas.viaje import CargaMasivaResultado, ViajeCreate, ViajeOut
from app.services.pricing import calculate_tarifa_cliente

router = APIRouter(prefix="/viajes", tags=["viajes"])


def _validate_user_access_operacion(user: Usuario, operacion: Operacion) -> None:
    if user.rol == UserRole.CLIENTE and user.cliente_id != operacion.cliente_id:
        raise HTTPException(status_code=403, detail="Operacion no disponible para este cliente")
    if user.rol == UserRole.TERCERO and user.tercero_id != operacion.tercero_id:
        raise HTTPException(status_code=403, detail="Operacion no disponible para este tercero")


@router.post("", response_model=ViajeOut)
def create_viaje(
    payload: ViajeCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol not in [UserRole.COINTRA, UserRole.TERCERO]:
        raise HTTPException(status_code=403, detail="Solo Cointra o Tercero puede cargar viajes")

    operacion = db.get(Operacion, payload.operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    _validate_user_access_operacion(user, operacion)

    viaje = Viaje(
        operacion_id=payload.operacion_id,
        tercero_id=operacion.tercero_id,
        titulo=payload.titulo,
        fecha_servicio=payload.fecha_servicio,
        origen=payload.origen,
        destino=payload.destino,
        placa=payload.placa,
        conductor=payload.conductor,
        tarifa_tercero=payload.tarifa_tercero,
        tarifa_cliente=payload.tarifa_cliente,
        manifiesto_avansat_id=payload.manifiesto_avansat_id,
        manifiesto_numero=payload.manifiesto_numero,
        descripcion=payload.descripcion,
        created_by=user.id,
        cargado_por=user.rol.value,
    )

    if viaje.tarifa_tercero and not viaje.tarifa_cliente:
        viaje.tarifa_cliente, viaje.rentabilidad = calculate_tarifa_cliente(float(viaje.tarifa_tercero), operacion)

    db.add(viaje)
    db.commit()
    db.refresh(viaje)
    return viaje


@router.get("", response_model=list[ViajeOut])
def list_viajes(
    operacion_id: int | None = None,
    only_pending: bool = False,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    query = db.query(Viaje).join(Operacion, Operacion.id == Viaje.operacion_id)
    if user.rol == UserRole.CLIENTE and user.cliente_id:
        query = query.filter(Operacion.cliente_id == user.cliente_id)
    if user.rol == UserRole.TERCERO and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id)
    if operacion_id:
        query = query.filter(Viaje.operacion_id == operacion_id)
    if only_pending:
        query = query.filter(Viaje.conciliado.is_(False))
    return query.order_by(Viaje.id.desc()).all()


@router.post("/carga-masiva", response_model=CargaMasivaResultado)
async def bulk_upload_viajes(
    operacion_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol not in [UserRole.COINTRA, UserRole.TERCERO]:
        raise HTTPException(status_code=403, detail="Solo Cointra o Tercero puede cargar viajes")

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
