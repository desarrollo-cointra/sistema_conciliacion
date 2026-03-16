from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.comentario import Comentario
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.enums import ItemEstado, ItemTipo, UserRole
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.schemas.historial import HistorialCambioOut, ResumenFinancieroOut
from app.schemas.conciliacion import (
    ClienteItemDecision,
    ComentarioCreate,
    ComentarioOut,
    ConciliacionCreate,
    ConciliacionItemCreate,
    ConciliacionItemOut,
    ConciliacionItemPatch,
    ConciliacionItemUpdateEstado,
    ConciliacionOut,
    ConciliacionWorkflowAction,
    ConciliacionUpdateEstado,
)
from app.services.pricing import apply_rentabilidad
from app.services.audit import log_change
from app.services.notifications import create_internal_notifications
from app.services.visibility import sanitize_item_for_role
from app.schemas.viaje import AdjuntarViajesRequest, ViajeOut

router = APIRouter(prefix="/conciliaciones", tags=["conciliaciones"])


def _validate_user_access_operacion(user: Usuario, operacion: Operacion) -> None:
    if user.rol == UserRole.CLIENTE and user.cliente_id != operacion.cliente_id:
        raise HTTPException(status_code=403, detail="Operacion no disponible para este cliente")
    if user.rol == UserRole.TERCERO and user.tercero_id != operacion.tercero_id:
        raise HTTPException(status_code=403, detail="Operacion no disponible para este tercero")


def _resolve_recipients(db: Session, operacion: Operacion, roles: list[UserRole]) -> list[Usuario]:
    recipients: list[Usuario] = []
    for role in roles:
        query = db.query(Usuario).filter(Usuario.activo.is_(True), Usuario.rol == role)
        if role == UserRole.CLIENTE:
            query = query.filter(Usuario.cliente_id == operacion.cliente_id)
        elif role == UserRole.TERCERO:
            query = query.filter(Usuario.tercero_id == operacion.tercero_id)
        recipients.extend(query.all())
    # Dedup por usuario
    uniq: dict[int, Usuario] = {u.id: u for u in recipients}
    return list(uniq.values())


@router.post("", response_model=ConciliacionOut)
def create_conciliacion(
    payload: ConciliacionCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Crear conciliaciones: COINTRA_ADMIN, COINTRA_USER (rol COINTRA)
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo usuarios Cointra pueden crear conciliaciones")

    operacion = db.get(Operacion, payload.operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    _validate_user_access_operacion(user, operacion)

    conc = Conciliacion(
        operacion_id=payload.operacion_id,
        nombre=payload.nombre,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        created_by=user.id,
    )
    db.add(conc)
    db.flush()

    # Cargar automaticamente todos los viajes PENDIENTES de la operacion
    viajes_pendientes = (
        db.query(Viaje)
        .filter(
            Viaje.operacion_id == payload.operacion_id,
            Viaje.conciliado.is_(False),
            Viaje.fecha_servicio <= payload.fecha_fin,
        )
        .order_by(Viaje.fecha_servicio.asc(), Viaje.id.asc())
        .all()
    )

    for viaje in viajes_pendientes:
        item = ConciliacionItem(
            conciliacion_id=conc.id,
            tipo=ItemTipo.VIAJE,
            fecha_servicio=viaje.fecha_servicio,
            origen=viaje.origen,
            destino=viaje.destino,
            placa=viaje.placa,
            conductor=viaje.conductor,
            tarifa_tercero=viaje.tarifa_tercero,
            tarifa_cliente=viaje.tarifa_cliente,
            rentabilidad=viaje.rentabilidad,
            manifiesto_numero=viaje.manifiesto_numero,
            remesa=None,
            descripcion=viaje.descripcion,
            created_by=user.id,
            cargado_por=viaje.cargado_por,
        )
        viaje.conciliado = True
        viaje.conciliacion_id = conc.id
        db.add(item)
        log_change(
            db,
            usuario_id=user.id,
            conciliacion_id=conc.id,
            campo="viaje_adjuntado",
            valor_nuevo=f"viaje_id={viaje.id}",
        )

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="conciliacion_creada",
        valor_nuevo=f"{payload.nombre} ({payload.fecha_inicio} - {payload.fecha_fin})",
    )
    db.commit()
    db.refresh(conc)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA])
    create_internal_notifications(
        db,
        recipients,
        titulo="Nueva conciliacion creada",
        mensaje=f"Se creo la conciliacion '{conc.nombre}' para la operacion '{operacion.nombre}'.",
        tipo="CONCILIACION",
    )
    db.commit()
    return conc


@router.get("", response_model=list[ConciliacionOut])
def list_conciliaciones(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    query = db.query(Conciliacion).join(Operacion, Operacion.id == Conciliacion.operacion_id)
    if user.rol == UserRole.CLIENTE and user.cliente_id:
        query = query.filter(Operacion.cliente_id == user.cliente_id)
    if user.rol == UserRole.TERCERO and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id)
    return query.order_by(Conciliacion.id.desc()).all()


@router.get("/historial-cerradas", response_model=list[ConciliacionOut])
def list_closed_history(
    fecha_inicio: str | None = None,
    fecha_fin: str | None = None,
    cliente_id: int | None = None,
    tercero_id: int | None = None,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    query = db.query(Conciliacion).join(Operacion, Operacion.id == Conciliacion.operacion_id)
    query = query.filter(Conciliacion.estado == "CERRADA")

    if user.rol == UserRole.CLIENTE and user.cliente_id:
        query = query.filter(Operacion.cliente_id == user.cliente_id)
    if user.rol == UserRole.TERCERO and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id)

    if cliente_id:
        query = query.filter(Operacion.cliente_id == cliente_id)
    if tercero_id:
        query = query.filter(Operacion.tercero_id == tercero_id)
    if fecha_inicio:
        query = query.filter(Conciliacion.fecha_inicio >= fecha_inicio)
    if fecha_fin:
        query = query.filter(Conciliacion.fecha_fin <= fecha_fin)

    return query.order_by(Conciliacion.id.desc()).all()


@router.patch("/{conciliacion_id}/estado", response_model=ConciliacionOut)
def update_estado_conciliacion(
    conciliacion_id: int,
    payload: ConciliacionUpdateEstado,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede cambiar estado de conciliacion")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    old_estado = conc.estado
    conc.estado = payload.estado
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="estado_conciliacion",
        valor_anterior=old_estado,
        valor_nuevo=payload.estado,
    )
    db.commit()
    db.refresh(conc)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA, UserRole.CLIENTE, UserRole.TERCERO])
    create_internal_notifications(
        db,
        recipients,
        titulo="Cambio de estado de conciliacion",
        mensaje=f"La conciliacion '{conc.nombre}' cambio a estado {conc.estado}.",
        tipo="ESTADO",
    )
    db.commit()
    return conc


@router.post("/items", response_model=ConciliacionItemOut)
def create_item(
    payload: ConciliacionItemCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede crear items")
    conc = db.get(Conciliacion, payload.conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    item = ConciliacionItem(
        conciliacion_id=payload.conciliacion_id,
        tipo=payload.tipo,
        fecha_servicio=payload.fecha_servicio,
        origen=payload.origen,
        destino=payload.destino,
        placa=payload.placa,
        conductor=payload.conductor,
        tarifa_tercero=payload.tarifa_tercero,
        tarifa_cliente=payload.tarifa_cliente,
        manifiesto_numero=payload.manifiesto_numero,
        remesa=payload.remesa,
        descripcion=payload.descripcion,
        created_by=user.id,
        cargado_por=user.rol.value,
    )

    if user.rol in [UserRole.TERCERO, UserRole.COINTRA]:
        if item.tarifa_tercero and not item.tarifa_cliente:
            apply_rentabilidad(item, operacion)

    db.add(item)
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="item_creado",
        valor_nuevo=f"tipo={item.tipo}; fecha={item.fecha_servicio}",
    )
    db.commit()
    db.refresh(item)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA])
    create_internal_notifications(
        db,
        recipients,
        titulo="Decision de cliente sobre item",
        mensaje=f"El cliente marco el item #{item.id} como {item.estado} en la conciliacion '{conc.nombre}'.",
        tipo="APROBACION",
    )
    db.commit()
    return item


@router.get("/{conciliacion_id}/items", response_model=list[ConciliacionItemOut])
def list_items(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    items = (
        db.query(ConciliacionItem)
        .filter(ConciliacionItem.conciliacion_id == conciliacion_id)
        .order_by(ConciliacionItem.id.desc())
        .all()
    )

    # Enmascara campos financieros segun actor.
    return [sanitize_item_for_role(ConciliacionItemOut.model_validate(i).model_dump(), user.rol) for i in items]


@router.patch("/items/{item_id}/estado", response_model=ConciliacionItemOut)
def update_item_estado(
    item_id: int,
    payload: ConciliacionItemUpdateEstado,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede cambiar estado de items")

    item = db.get(ConciliacionItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    conc = db.get(Conciliacion, item.conciliacion_id)
    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    old_estado = item.estado
    item.estado = payload.estado
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        item_id=item.id,
        campo="estado_item",
        valor_anterior=old_estado,
        valor_nuevo=payload.estado,
    )

    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=ConciliacionItemOut)
def patch_item(
    item_id: int,
    payload: ConciliacionItemPatch,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede actualizar items")

    item = db.get(ConciliacionItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    conc = db.get(Conciliacion, item.conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")
    if conc.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo se puede editar en BORRADOR")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    changed = payload.model_fields_set

    old_manifiesto = item.manifiesto_numero
    old_remesa = item.remesa
    old_tarifa_tercero = item.tarifa_tercero
    old_tarifa_cliente = item.tarifa_cliente
    old_rentabilidad = item.rentabilidad

    if "manifiesto_numero" in changed:
        item.manifiesto_numero = payload.manifiesto_numero
    if "remesa" in changed:
        item.remesa = payload.remesa

    pct = float(operacion.porcentaje_rentabilidad)
    # Usar rentabilidad actual del ítem; solo como fallback la de la operación
    pct = float(item.rentabilidad) if item.rentabilidad is not None else float(operacion.porcentaje_rentabilidad)

    tarifa_fields = changed & {"tarifa_tercero", "tarifa_cliente", "rentabilidad"}
    if tarifa_fields:
        if "tarifa_tercero" in changed and "tarifa_cliente" not in changed and "rentabilidad" not in changed:
            # Modificó tarifa_tercero → recalcular tarifa_cliente; rentabilidad no cambia
            item.tarifa_tercero = payload.tarifa_tercero
            if pct < 100:
                item.tarifa_cliente = payload.tarifa_tercero / (1 - pct / 100)
        elif "tarifa_cliente" in changed and "tarifa_tercero" not in changed and "rentabilidad" not in changed:
            # Modificó tarifa_cliente → recalcular tarifa_tercero; rentabilidad no cambia
            item.tarifa_cliente = payload.tarifa_cliente
            item.tarifa_tercero = payload.tarifa_cliente * (1 - pct / 100)
        elif "rentabilidad" in changed:
            # Modificó % rentabilidad → guardar nuevo %, recalcular tarifa_tercero; tarifa_cliente no cambia
            new_pct = payload.rentabilidad if payload.rentabilidad is not None else pct
            item.rentabilidad = new_pct
            if item.tarifa_cliente is not None and new_pct < 100:
                item.tarifa_tercero = float(item.tarifa_cliente) * (1 - new_pct / 100)

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        item_id=item.id,
        campo="actualizacion_manual_item",
        valor_anterior=f"manifiesto={old_manifiesto}; remesa={old_remesa}; t3={old_tarifa_tercero}; tc={old_tarifa_cliente}; rent={old_rentabilidad}",
        valor_nuevo=f"manifiesto={item.manifiesto_numero}; remesa={item.remesa}; t3={item.tarifa_tercero}; tc={item.tarifa_cliente}; rent={item.rentabilidad}",
    )

    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}/decision-cliente", response_model=ConciliacionItemOut)
def cliente_decide_item(
    item_id: int,
    payload: ClienteItemDecision,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Solo Cliente puede aprobar/rechazar items")
    if payload.estado not in [ItemEstado.APROBADO, ItemEstado.RECHAZADO]:
        raise HTTPException(status_code=400, detail="Estado permitido para Cliente: APROBADO o RECHAZADO")

    item = db.get(ConciliacionItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    conc = db.get(Conciliacion, item.conciliacion_id)
    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    old_estado = item.estado
    item.estado = payload.estado
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        item_id=item.id,
        campo="decision_cliente_item",
        valor_anterior=old_estado,
        valor_nuevo=payload.estado,
    )
    if payload.comentario:
        db.add(
            Comentario(
                conciliacion_id=conc.id,
                item_id=item.id,
                usuario_id=user.id,
                comentario=payload.comentario,
            )
        )

    db.commit()
    db.refresh(item)
    return item


@router.post("/{conciliacion_id}/enviar-revision", response_model=ConciliacionOut)
def enviar_revision(
    conciliacion_id: int,
    payload: ConciliacionWorkflowAction,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede enviar a revision")
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    conc.estado = "EN_REVISION"
    items = db.query(ConciliacionItem).filter(ConciliacionItem.conciliacion_id == conc.id).all()
    for item in items:
        if item.estado == ItemEstado.PENDIENTE:
            item.estado = ItemEstado.EN_REVISION

    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="enviar_revision",
        valor_nuevo=payload.observacion or "sin observacion",
    )
    db.commit()
    db.refresh(conc)

    recipients = _resolve_recipients(db, operacion, [UserRole.CLIENTE])
    create_internal_notifications(
        db,
        recipients,
        titulo="Conciliacion enviada a revision",
        mensaje=f"Cointra envio la conciliacion '{conc.nombre}' para tu revision.",
        tipo="ESTADO",
    )
    db.commit()
    return conc


@router.post("/{conciliacion_id}/aprobar-cliente", response_model=ConciliacionOut)
def aprobar_conciliacion_cliente(
    conciliacion_id: int,
    payload: ConciliacionWorkflowAction,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.CLIENTE:
        raise HTTPException(status_code=403, detail="Solo Cliente puede aprobar conciliacion")
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)
    items = db.query(ConciliacionItem).filter(ConciliacionItem.conciliacion_id == conc.id).all()
    pendientes = [i for i in items if i.estado != ItemEstado.APROBADO]
    if pendientes:
        raise HTTPException(status_code=400, detail="No se puede aprobar: existen items no aprobados")

    conc.estado = "APROBADA"
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="aprobacion_cliente",
        valor_nuevo=payload.observacion or "aprobada por cliente",
    )
    db.commit()
    db.refresh(conc)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA, UserRole.TERCERO])
    create_internal_notifications(
        db,
        recipients,
        titulo="Conciliacion aprobada por cliente",
        mensaje=f"La conciliacion '{conc.nombre}' fue aprobada por el cliente y quedo autorizada para facturar.",
        tipo="APROBACION",
    )
    db.commit()
    return conc


@router.post("/{conciliacion_id}/cerrar", response_model=ConciliacionOut)
def cerrar_conciliacion(
    conciliacion_id: int,
    payload: ConciliacionWorkflowAction,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede cerrar conciliacion")
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    if conc.estado != "APROBADA":
        raise HTTPException(status_code=400, detail="Solo conciliaciones aprobadas pueden cerrarse")
    operacion = db.get(Operacion, conc.operacion_id)
    conc.estado = "CERRADA"
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=conc.id,
        campo="cierre_conciliacion",
        valor_nuevo=payload.observacion or "cierre formal",
    )
    db.commit()
    db.refresh(conc)

    recipients = _resolve_recipients(db, operacion, [UserRole.COINTRA, UserRole.CLIENTE, UserRole.TERCERO])
    create_internal_notifications(
        db,
        recipients,
        titulo="Conciliacion cerrada",
        mensaje=f"La conciliacion '{conc.nombre}' fue cerrada formalmente.",
        tipo="CIERRE",
    )
    db.commit()
    return conc


@router.post("/comentarios", response_model=ComentarioOut)
def add_comment(
    payload: ComentarioCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol == UserRole.TERCERO:
        raise HTTPException(status_code=403, detail="Tercero no puede agregar comentarios")
    conc = db.get(Conciliacion, payload.conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    if payload.item_id:
        item = db.get(ConciliacionItem, payload.item_id)
        if not item or item.conciliacion_id != payload.conciliacion_id:
            raise HTTPException(status_code=400, detail="Item invalido para la conciliacion")

    comment = Comentario(
        conciliacion_id=payload.conciliacion_id,
        item_id=payload.item_id,
        usuario_id=user.id,
        comentario=payload.comentario,
    )
    db.add(comment)
    log_change(
        db,
        usuario_id=user.id,
        conciliacion_id=payload.conciliacion_id,
        item_id=payload.item_id,
        campo="comentario",
        valor_nuevo=payload.comentario,
    )
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/{conciliacion_id}/comentarios", response_model=list[ComentarioOut])
def get_comments(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    return (
        db.query(Comentario)
        .filter(Comentario.conciliacion_id == conciliacion_id)
        .order_by(Comentario.id.desc())
        .all()
    )


@router.get("/{conciliacion_id}/viajes-pendientes", response_model=list[ViajeOut])
def get_pending_viajes(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    return (
        db.query(Viaje)
        .filter(Viaje.operacion_id == conc.operacion_id, Viaje.conciliado.is_(False))
        .order_by(Viaje.fecha_servicio.asc(), Viaje.id.asc())
        .all()
    )


@router.post("/{conciliacion_id}/adjuntar-viajes", response_model=list[ConciliacionItemOut])
def attach_pending_viajes(
    conciliacion_id: int,
    payload: AdjuntarViajesRequest,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede adjuntar viajes")

    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    viajes = (
        db.query(Viaje)
        .filter(Viaje.id.in_(payload.viaje_ids), Viaje.operacion_id == conc.operacion_id, Viaje.conciliado.is_(False))
        .all()
    )
    if not viajes:
        raise HTTPException(status_code=400, detail="No hay viajes pendientes validos para adjuntar")

    created_items: list[ConciliacionItem] = []
    for viaje in viajes:
        item = ConciliacionItem(
            conciliacion_id=conc.id,
            tipo=ItemTipo.VIAJE,
            fecha_servicio=viaje.fecha_servicio,
            origen=viaje.origen,
            destino=viaje.destino,
            placa=viaje.placa,
            conductor=viaje.conductor,
            tarifa_tercero=viaje.tarifa_tercero,
            tarifa_cliente=viaje.tarifa_cliente,
            rentabilidad=viaje.rentabilidad,
            manifiesto_numero=viaje.manifiesto_numero,
            remesa=None,
            descripcion=viaje.descripcion,
            created_by=user.id,
            cargado_por=viaje.cargado_por,
        )
        viaje.conciliado = True
        viaje.conciliacion_id = conc.id
        db.add(item)
        log_change(
            db,
            usuario_id=user.id,
            conciliacion_id=conc.id,
            campo="viaje_adjuntado",
            valor_nuevo=f"viaje_id={viaje.id}",
        )
        created_items.append(item)

    db.commit()
    for item in created_items:
        db.refresh(item)
    return created_items


@router.get("/{conciliacion_id}/historial", response_model=list[HistorialCambioOut])
def get_historial(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    return (
        db.query(HistorialCambio)
        .filter(HistorialCambio.conciliacion_id == conciliacion_id)
        .order_by(HistorialCambio.id.desc())
        .all()
    )


@router.get("/{conciliacion_id}/resumen-financiero", response_model=ResumenFinancieroOut)
def get_resumen_financiero(
    conciliacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    conc = db.get(Conciliacion, conciliacion_id)
    if not conc:
        raise HTTPException(status_code=404, detail="Conciliacion no encontrada")

    operacion = db.get(Operacion, conc.operacion_id)
    _validate_user_access_operacion(user, operacion)

    items = db.query(ConciliacionItem).filter(ConciliacionItem.conciliacion_id == conciliacion_id).all()
    total_tercero = sum(float(i.tarifa_tercero or 0) for i in items)
    total_cliente = sum(float(i.tarifa_cliente or 0) for i in items)
    total_rentabilidad_valor = total_cliente - total_tercero
    pct_vals = [float(i.rentabilidad) for i in items if i.rentabilidad is not None]
    pct_promedio = (sum(pct_vals) / len(pct_vals)) if pct_vals else 0

    if user.rol == UserRole.COINTRA:
        return {
            "total_tarifa_tercero": total_tercero,
            "total_tarifa_cliente": total_cliente,
            "total_rentabilidad_valor": total_rentabilidad_valor,
            "total_rentabilidad_pct_promedio": pct_promedio,
        }
    if user.rol == UserRole.CLIENTE:
        return {
            "total_tarifa_tercero": None,
            "total_tarifa_cliente": total_cliente,
            "total_rentabilidad_valor": None,
            "total_rentabilidad_pct_promedio": None,
        }
    return {
        "total_tarifa_tercero": total_tercero,
        "total_tarifa_cliente": None,
        "total_rentabilidad_valor": None,
        "total_rentabilidad_pct_promedio": None,
    }
