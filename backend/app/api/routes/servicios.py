import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, is_cointra_admin
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.servicio import Servicio
from app.models.usuario import Usuario
from app.schemas.servicio import ServicioCreate, ServicioOut, ServicioUpdate

router = APIRouter(prefix="/servicios", tags=["servicios"])


def _ensure_cointra_admin(user: Usuario) -> None:
    if not is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo COINTRA_ADMIN puede gestionar servicios")


def _to_codigo(nombre: str) -> str:
    normalized = unicodedata.normalize("NFKD", nombre)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9]+", "_", ascii_only.upper()).strip("_")


@router.get("", response_model=list[ServicioOut])
def list_servicios(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    query = db.query(Servicio)
    if user.rol != UserRole.COINTRA or not is_cointra_admin(user):
        query = query.filter(Servicio.activo.is_(True))
    return query.order_by(Servicio.nombre).all()


@router.post("", response_model=ServicioOut)
def create_servicio(
    payload: ServicioCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    nombre = payload.nombre.strip()
    codigo = _to_codigo(nombre)
    if not codigo:
        raise HTTPException(status_code=400, detail="Nombre de servicio invalido")

    if db.query(Servicio).filter(Servicio.nombre == nombre).first():
        raise HTTPException(status_code=400, detail="Ya existe un servicio con ese nombre")

    if db.query(Servicio).filter(Servicio.codigo == codigo).first():
        raise HTTPException(status_code=400, detail="Ya existe un servicio con ese codigo")

    servicio = Servicio(
        nombre=nombre,
        codigo=codigo,
        requiere_origen_destino=payload.requiere_origen_destino,
        activo=True,
        created_by=user.id
    )
    db.add(servicio)
    db.commit()
    db.refresh(servicio)
    return servicio


@router.patch("/{servicio_id}", response_model=ServicioOut)
def update_servicio(
    servicio_id: int,
    payload: ServicioUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    servicio = db.get(Servicio, servicio_id)
    if not servicio:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "nombre" in data and data["nombre"] is not None:
        nombre = data["nombre"].strip()
        codigo = _to_codigo(nombre)
        existing_nombre = db.query(Servicio).filter(Servicio.nombre == nombre, Servicio.id != servicio_id).first()
        if existing_nombre:
            raise HTTPException(status_code=400, detail="Ya existe un servicio con ese nombre")
        existing_codigo = db.query(Servicio).filter(Servicio.codigo == codigo, Servicio.id != servicio_id).first()
        if existing_codigo:
            raise HTTPException(status_code=400, detail="Ya existe un servicio con ese codigo")
        servicio.nombre = nombre
        servicio.codigo = codigo

    if "requiere_origen_destino" in data and data["requiere_origen_destino"] is not None:
        servicio.requiere_origen_destino = bool(data["requiere_origen_destino"])

    db.commit()
    db.refresh(servicio)
    return servicio


@router.delete("/{servicio_id}")
def deactivate_servicio(
    servicio_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    servicio = db.get(Servicio, servicio_id)
    if not servicio:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    servicio.activo = False
    db.commit()
    return {"ok": True}


@router.post("/{servicio_id}/reactivar")
def reactivate_servicio(
    servicio_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    servicio = db.get(Servicio, servicio_id)
    if not servicio:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    servicio.activo = True
    db.commit()
    return {"ok": True}
