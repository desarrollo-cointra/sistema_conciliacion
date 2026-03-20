from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, is_cointra_admin
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.cliente import Cliente
from app.models.enums import CointraSubRol, UserRole
from app.models.operacion import Operacion
from app.models.tercero import Tercero
from app.models.usuario import Usuario
from app.models.usuario_operacion import usuario_operaciones_asignadas
from app.schemas.catalogs import (
    ClienteCreate,
    ClienteOut,
    ClienteUpdate,
    OperacionCreate,
    OperacionOut,
    OperacionRentabilidadUpdate,
    OperacionUpdate,
    TerceroCreate,
    TerceroOut,
    TerceroUpdate,
)
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/catalogs", tags=["catalogs"])


def _ensure_cointra_admin(user: Usuario) -> None:
    if not is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo COINTRA_ADMIN puede editar o inactivar")


def _serialize_user(usuario: Usuario) -> dict:
    payload = UserOut.model_validate(usuario).model_dump()
    payload["operacion_ids"] = sorted({op.id for op in usuario.operaciones_asignadas})
    return payload


def _serialize_operacion(operacion: Operacion) -> dict:
    payload = OperacionOut.model_validate(operacion).model_dump()
    payload["cliente_usuario_ids"] = sorted(
        {
            u.id
            for u in operacion.usuarios_cliente_asignados
            if u.rol == UserRole.CLIENTE and u.cliente_id == operacion.cliente_id
        }
    )
    return payload


def _client_users_for_cliente(db: Session, cliente_id: int, only_active: bool = True) -> list[Usuario]:
    query = db.query(Usuario).filter(Usuario.rol == UserRole.CLIENTE, Usuario.cliente_id == cliente_id)
    if only_active:
        query = query.filter(Usuario.activo.is_(True))
    return query.order_by(Usuario.nombre.asc()).all()


def _validate_client_user_ids(db: Session, cliente_id: int, user_ids: list[int]) -> list[Usuario]:
    if not user_ids:
        return []
    uniq_ids = sorted({int(uid) for uid in user_ids})
    rows = db.query(Usuario).filter(Usuario.id.in_(uniq_ids)).all()
    if len(rows) != len(uniq_ids):
        raise HTTPException(status_code=400, detail="Hay usuarios cliente inválidos en la asignación")
    for row in rows:
        if row.rol != UserRole.CLIENTE:
            raise HTTPException(status_code=400, detail="Solo usuarios con rol CLIENTE pueden asignarse a operaciones")
        if row.cliente_id != cliente_id:
            raise HTTPException(status_code=400, detail="Todos los usuarios asignados deben pertenecer al cliente de la operación")
        if not row.activo:
            raise HTTPException(status_code=400, detail="No puedes asignar usuarios cliente inactivos")
    return rows


def _set_operacion_assignments(
    db: Session,
    operacion: Operacion,
    explicit_user_ids: list[int] | None,
) -> None:
    if explicit_user_ids is None:
        candidates = _client_users_for_cliente(db, operacion.cliente_id, only_active=True)
        operacion.usuarios_cliente_asignados = candidates
        return

    assigned_users = _validate_client_user_ids(db, operacion.cliente_id, explicit_user_ids)
    operacion.usuarios_cliente_asignados = assigned_users


@router.get("/clientes", response_model=list[ClienteOut])
def get_clientes(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    user = _
    query = db.query(Cliente)
    if not is_cointra_admin(user):
        query = query.filter(Cliente.activo.is_(True))
    return query.order_by(Cliente.nombre).all()


@router.post("/clientes", response_model=ClienteOut)
def create_cliente(
    payload: ClienteCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede crear clientes")

    nit = payload.nit.strip()
    if db.query(Cliente).filter(Cliente.nit == nit).first():
        raise HTTPException(status_code=400, detail="Ya existe un cliente con ese NIT")

    cliente = Cliente(nombre=payload.nombre.strip(), nit=nit, activo=True)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.get("/terceros", response_model=list[TerceroOut])
def get_terceros(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    user = _
    query = db.query(Tercero)
    if not is_cointra_admin(user):
        query = query.filter(Tercero.activo.is_(True))
    return query.order_by(Tercero.nombre).all()


@router.post("/terceros", response_model=TerceroOut)
def create_tercero(
    payload: TerceroCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede crear terceros")

    nit = payload.nit.strip()
    if db.query(Tercero).filter(Tercero.nit == nit).first():
        raise HTTPException(status_code=400, detail="Ya existe un tercero con ese NIT")

    tercero = Tercero(nombre=payload.nombre.strip(), nit=nit, activo=True)
    db.add(tercero)
    db.commit()
    db.refresh(tercero)
    return tercero


@router.get("/operaciones", response_model=list[OperacionOut])
def get_operaciones(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    query = db.query(Operacion)
    if not is_cointra_admin(user):
        query = query.filter(Operacion.activa.is_(True))
    if user.rol == UserRole.CLIENTE:
        query = query.join(
            usuario_operaciones_asignadas,
            usuario_operaciones_asignadas.c.operacion_id == Operacion.id,
        ).filter(usuario_operaciones_asignadas.c.usuario_id == user.id)
    if user.rol.value == "TERCERO" and user.tercero_id:
        query = query.filter(Operacion.tercero_id == user.tercero_id)
    operaciones = query.order_by(Operacion.nombre).all()
    return [_serialize_operacion(op) for op in operaciones]


@router.post("/operaciones", response_model=OperacionOut)
def create_operacion(
    payload: OperacionCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede crear operaciones")

    cliente = db.get(Cliente, payload.cliente_id)
    if not cliente or not cliente.activo:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    tercero = db.get(Tercero, payload.tercero_id)
    if not tercero or not tercero.activo:
        raise HTTPException(status_code=404, detail="Tercero no encontrado")

    operacion = Operacion(
        cliente_id=payload.cliente_id,
        tercero_id=payload.tercero_id,
        nombre=payload.nombre.strip(),
        porcentaje_rentabilidad=payload.porcentaje_rentabilidad,
        activa=True,
    )
    db.add(operacion)
    db.flush()
    _set_operacion_assignments(db, operacion, payload.cliente_usuario_ids)
    db.commit()
    db.refresh(operacion)
    return _serialize_operacion(operacion)


@router.get("/usuarios", response_model=list[UserOut])
def get_usuarios(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if user.rol != UserRole.COINTRA or user.sub_rol != CointraSubRol.COINTRA_ADMIN:
        raise HTTPException(status_code=403, detail="Solo COINTRA_ADMIN puede listar usuarios")
    usuarios = db.query(Usuario).order_by(Usuario.id.desc()).all()
    return [_serialize_user(u) for u in usuarios]


@router.get("/clientes/{cliente_id}/usuarios-cliente", response_model=list[UserOut])
def list_cliente_users_for_operacion(
    cliente_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede consultar usuarios cliente")
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    usuarios = _client_users_for_cliente(db, cliente_id, only_active=True)
    return [_serialize_user(u) for u in usuarios]


@router.patch("/clientes/{cliente_id}", response_model=ClienteOut)
def update_cliente(
    cliente_id: int,
    payload: ClienteUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "nit" in data:
        nit = (data["nit"] or "").strip()
        existing = db.query(Cliente).filter(Cliente.nit == nit, Cliente.id != cliente_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un cliente con ese NIT")
        data["nit"] = nit
    if "nombre" in data and data["nombre"] is not None:
        data["nombre"] = data["nombre"].strip()

    for field, value in data.items():
        setattr(cliente, field, value)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/clientes/{cliente_id}")
def deactivate_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    cliente.activo = False
    db.commit()
    return {"ok": True}


@router.post("/clientes/{cliente_id}/reactivar")
def reactivate_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    cliente.activo = True
    db.commit()
    return {"ok": True}


@router.patch("/terceros/{tercero_id}", response_model=TerceroOut)
def update_tercero(
    tercero_id: int,
    payload: TerceroUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    tercero = db.get(Tercero, tercero_id)
    if not tercero:
        raise HTTPException(status_code=404, detail="Tercero no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "nit" in data:
        nit = (data["nit"] or "").strip()
        existing = db.query(Tercero).filter(Tercero.nit == nit, Tercero.id != tercero_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un tercero con ese NIT")
        data["nit"] = nit
    if "nombre" in data and data["nombre"] is not None:
        data["nombre"] = data["nombre"].strip()

    for field, value in data.items():
        setattr(tercero, field, value)
    db.commit()
    db.refresh(tercero)
    return tercero


@router.delete("/terceros/{tercero_id}")
def deactivate_tercero(
    tercero_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    tercero = db.get(Tercero, tercero_id)
    if not tercero:
        raise HTTPException(status_code=404, detail="Tercero no encontrado")
    tercero.activo = False
    db.commit()
    return {"ok": True}


@router.post("/terceros/{tercero_id}/reactivar")
def reactivate_tercero(
    tercero_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    tercero = db.get(Tercero, tercero_id)
    if not tercero:
        raise HTTPException(status_code=404, detail="Tercero no encontrado")
    tercero.activo = True
    db.commit()
    return {"ok": True}


@router.patch("/operaciones/{operacion_id}", response_model=OperacionOut)
def update_operacion(
    operacion_id: int,
    payload: OperacionUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")

    data = payload.model_dump(exclude_unset=True)
    requested_user_ids = data.pop("cliente_usuario_ids", None)
    old_cliente_id = operacion.cliente_id
    if "cliente_id" in data:
        cliente = db.get(Cliente, data["cliente_id"])
        if not cliente or not cliente.activo:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if "tercero_id" in data:
        tercero = db.get(Tercero, data["tercero_id"])
        if not tercero or not tercero.activo:
            raise HTTPException(status_code=404, detail="Tercero no encontrado")
    if "nombre" in data and data["nombre"] is not None:
        data["nombre"] = data["nombre"].strip()

    for field, value in data.items():
        setattr(operacion, field, value)

    if requested_user_ids is not None:
        _set_operacion_assignments(db, operacion, requested_user_ids)
    elif old_cliente_id != operacion.cliente_id:
        _set_operacion_assignments(db, operacion, None)

    db.commit()
    db.refresh(operacion)
    return _serialize_operacion(operacion)


@router.delete("/operaciones/{operacion_id}")
def deactivate_operacion(
    operacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    operacion.activa = False
    db.commit()
    return {"ok": True}


@router.post("/operaciones/{operacion_id}/reactivar")
def reactivate_operacion(
    operacion_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    operacion.activa = True
    db.commit()
    return {"ok": True}


@router.patch("/usuarios/{usuario_id}", response_model=UserOut)
def update_usuario(
    usuario_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    data = payload.model_dump(exclude_unset=True)
    requested_operacion_ids = data.pop("operacion_ids", None)
    if "email" in data and data["email"] is not None:
        email = data["email"].strip().lower()
        existing = db.query(Usuario).filter(Usuario.email == email, Usuario.id != usuario_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
        data["email"] = email
    if "nombre" in data and data["nombre"] is not None:
        data["nombre"] = data["nombre"].strip()

    target_role = data.get("rol", usuario.rol)
    target_cliente_id = data.get("cliente_id", usuario.cliente_id)
    target_tercero_id = data.get("tercero_id", usuario.tercero_id)

    if target_role == UserRole.CLIENTE:
        if not target_cliente_id:
            raise HTTPException(status_code=400, detail="Debe seleccionar cliente para usuarios CLIENTE")
        cliente = db.get(Cliente, target_cliente_id)
        if not cliente or not cliente.activo:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        data["tercero_id"] = None
    elif requested_operacion_ids is not None:
        raise HTTPException(status_code=400, detail="operacion_ids solo aplica para usuarios CLIENTE")
    else:
        data["cliente_id"] = None if target_role != UserRole.CLIENTE else target_cliente_id

    if target_role == UserRole.TERCERO:
        if not target_tercero_id:
            raise HTTPException(status_code=400, detail="Debe seleccionar tercero para usuarios TERCERO")
        tercero = db.get(Tercero, target_tercero_id)
        if not tercero or not tercero.activo:
            raise HTTPException(status_code=404, detail="Tercero no encontrado")
    else:
        data["tercero_id"] = None if target_role != UserRole.TERCERO else target_tercero_id

    if target_role == UserRole.COINTRA:
        data["sub_rol"] = data.get("sub_rol") or usuario.sub_rol or CointraSubRol.COINTRA_USER
        data["cliente_id"] = None
        data["tercero_id"] = None
    elif "sub_rol" in data:
        data["sub_rol"] = None

    for field, value in data.items():
        setattr(usuario, field, value)

    if usuario.rol == UserRole.CLIENTE:
        if requested_operacion_ids is None:
            if not usuario.operaciones_asignadas:
                usuario.operaciones_asignadas = (
                    db.query(Operacion)
                    .filter(Operacion.cliente_id == usuario.cliente_id)
                    .order_by(Operacion.id.asc())
                    .all()
                )
        else:
            ops = (
                db.query(Operacion)
                .filter(Operacion.id.in_(sorted({int(op_id) for op_id in requested_operacion_ids})))
                .all()
                if requested_operacion_ids
                else []
            )
            if len(ops) != len(sorted({int(op_id) for op_id in requested_operacion_ids})):
                raise HTTPException(status_code=400, detail="Hay operaciones inválidas en la asignación")
            for op in ops:
                if op.cliente_id != usuario.cliente_id:
                    raise HTTPException(status_code=400, detail="Solo puedes asignar operaciones del cliente del usuario")
            usuario.operaciones_asignadas = ops
    else:
        usuario.operaciones_asignadas = []

    db.commit()
    db.refresh(usuario)
    return _serialize_user(usuario)


@router.delete("/usuarios/{usuario_id}")
def deactivate_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    usuario.activo = False
    db.commit()
    return {"ok": True}


@router.post("/usuarios/{usuario_id}/reactivar")
def reactivate_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    usuario.activo = True
    db.commit()
    return {"ok": True}


@router.post("/usuarios", response_model=UserOut)
def create_usuario(
    payload: UserCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA or user.sub_rol != CointraSubRol.COINTRA_ADMIN:
        raise HTTPException(status_code=403, detail="Solo COINTRA_ADMIN puede crear usuarios")

    email = payload.email.strip().lower()
    if db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")

    if payload.rol == UserRole.CLIENTE:
        if not payload.cliente_id:
            raise HTTPException(status_code=400, detail="Debe seleccionar cliente para usuarios CLIENTE")
        if not db.get(Cliente, payload.cliente_id):
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
    elif payload.cliente_id is not None:
        raise HTTPException(status_code=400, detail="cliente_id solo aplica para usuarios CLIENTE")

    if payload.rol != UserRole.CLIENTE and payload.operacion_ids:
        raise HTTPException(status_code=400, detail="operacion_ids solo aplica para usuarios CLIENTE")

    if payload.rol == UserRole.TERCERO:
        if not payload.tercero_id:
            raise HTTPException(status_code=400, detail="Debe seleccionar tercero para usuarios TERCERO")
        if not db.get(Tercero, payload.tercero_id):
            raise HTTPException(status_code=404, detail="Tercero no encontrado")
    elif payload.tercero_id is not None:
        raise HTTPException(status_code=400, detail="tercero_id solo aplica para usuarios TERCERO")

    if payload.rol == UserRole.COINTRA:
        sub_rol = payload.sub_rol or CointraSubRol.COINTRA_USER
    else:
        sub_rol = None

    usuario = Usuario(
        nombre=payload.nombre.strip(),
        email=email,
        password_hash=get_password_hash(payload.password),
        rol=payload.rol,
        sub_rol=sub_rol,
        cliente_id=payload.cliente_id if payload.rol == UserRole.CLIENTE else None,
        tercero_id=payload.tercero_id if payload.rol == UserRole.TERCERO else None,
        activo=True,
    )
    db.add(usuario)
    db.flush()

    if payload.rol == UserRole.CLIENTE:
        if payload.operacion_ids:
            ops = db.query(Operacion).filter(Operacion.id.in_(sorted({int(op_id) for op_id in payload.operacion_ids}))).all()
            if len(ops) != len(sorted({int(op_id) for op_id in payload.operacion_ids})):
                raise HTTPException(status_code=400, detail="Hay operaciones inválidas en la asignación")
            for op in ops:
                if op.cliente_id != payload.cliente_id:
                    raise HTTPException(status_code=400, detail="Solo puedes asignar operaciones del cliente del usuario")
            usuario.operaciones_asignadas = ops
        else:
            usuario.operaciones_asignadas = (
                db.query(Operacion)
                .filter(Operacion.cliente_id == payload.cliente_id)
                .order_by(Operacion.id.asc())
                .all()
            )

    db.commit()
    db.refresh(usuario)
    return _serialize_user(usuario)


@router.patch("/operaciones/{operacion_id}/rentabilidad", response_model=OperacionOut)
def update_operacion_rentabilidad(
    operacion_id: int,
    payload: OperacionRentabilidadUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Gestionar operaciones: solo Cointra (ADMIN/USER) a nivel de backend
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede configurar rentabilidad")

    operacion = db.get(Operacion, operacion_id)
    if not operacion:
        raise HTTPException(status_code=404, detail="Operacion no encontrada")
    operacion.porcentaje_rentabilidad = payload.porcentaje_rentabilidad
    db.commit()
    db.refresh(operacion)
    return _serialize_operacion(operacion)
