from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.enums import CointraSubRol, UserRole
from app.models.tipo_vehiculo import TipoVehiculo
from app.models.usuario import Usuario
from app.models.vehiculo import Vehiculo
from app.schemas.vehiculo import TipoVehiculoCreate, TipoVehiculoOut, VehiculoCreate, VehiculoOut

router = APIRouter(prefix="/vehiculos", tags=["vehiculos"])


def _is_cointra_admin(user: Usuario) -> bool:
    return user.rol == UserRole.COINTRA and getattr(user, "sub_rol", None) == CointraSubRol.COINTRA_ADMIN


@router.get("/tipos-vehiculo", response_model=list[TipoVehiculoOut])
def list_tipos_vehiculo(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return (
        db.query(TipoVehiculo)
        .filter(TipoVehiculo.activo.is_(True))
        .order_by(TipoVehiculo.nombre)
        .all()
    )


@router.post("/tipos-vehiculo", response_model=TipoVehiculoOut)
def create_tipo_vehiculo(
    payload: TipoVehiculoCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Crear tipos de vehiculo: Cointra (ADMIN/USER) y Tercero pueden proponer
    if user.rol not in [UserRole.COINTRA, UserRole.TERCERO]:
        raise HTTPException(status_code=403, detail="No tiene permisos para crear tipos de vehiculo")

    existing = db.query(TipoVehiculo).filter(TipoVehiculo.nombre == payload.nombre).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un tipo de vehiculo con ese nombre")

    tipo = TipoVehiculo(nombre=payload.nombre, activo=True)
    db.add(tipo)
    db.commit()
    db.refresh(tipo)
    return tipo


@router.put("/tipos-vehiculo/{tipo_id}", response_model=TipoVehiculoOut)
def update_tipo_vehiculo(
    tipo_id: int,
    payload: TipoVehiculoCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if not _is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo Cointra Admin puede editar tipos de vehiculo")

    tipo = db.get(TipoVehiculo, tipo_id)
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de vehiculo no encontrado")

    tipo.nombre = payload.nombre
    db.commit()
    db.refresh(tipo)
    return tipo


@router.delete("/tipos-vehiculo/{tipo_id}")
def delete_tipo_vehiculo(
    tipo_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if not _is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo Cointra Admin puede eliminar tipos de vehiculo")

    tipo = db.get(TipoVehiculo, tipo_id)
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de vehiculo no encontrado")

    # Borrado logico: marcar inactivo
    tipo.activo = False
    db.commit()
    return {"ok": True}


@router.get("", response_model=list[VehiculoOut])
def list_vehiculos(db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)):
    return (
        db.query(Vehiculo)
        .filter(Vehiculo.activo.is_(True))
        .order_by(Vehiculo.placa)
        .all()
    )


@router.post("", response_model=VehiculoOut)
def create_vehiculo(
    payload: VehiculoCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Crear vehiculos: COINTRA_ADMIN, COINTRA_USER, TERCERO
    if user.rol not in [UserRole.COINTRA, UserRole.TERCERO]:
        raise HTTPException(status_code=403, detail="No tiene permisos para crear vehiculos")

    tipo = db.get(TipoVehiculo, payload.tipo_vehiculo_id)
    if not tipo or not tipo.activo:
        raise HTTPException(status_code=400, detail="Tipo de vehiculo invalido")

    placa_up = payload.placa.upper()
    existing = db.query(Vehiculo).filter(Vehiculo.placa == placa_up).first()
    if existing:
        if existing.activo:
            raise HTTPException(status_code=400, detail="Ya existe un vehiculo con esa placa")
        # Reactivar vehiculo previamente eliminado
        existing.activo = True
        existing.tipo_vehiculo_id = payload.tipo_vehiculo_id
        existing.propietario = payload.propietario
        existing.created_by = user.id
        db.commit()
        db.refresh(existing)
        return existing

    vehiculo = Vehiculo(
        placa=placa_up,
        tipo_vehiculo_id=payload.tipo_vehiculo_id,
        propietario=payload.propietario,
        activo=True,
        created_by=user.id,
    )
    db.add(vehiculo)
    db.commit()
    db.refresh(vehiculo)
    return vehiculo


@router.put("/{vehiculo_id}", response_model=VehiculoOut)
def update_vehiculo(
    vehiculo_id: int,
    payload: VehiculoCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Editar vehiculos: solo COINTRA_ADMIN
    if not _is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo Cointra Admin puede editar vehiculos")

    vehiculo = db.get(Vehiculo, vehiculo_id)
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehiculo no encontrado")

    existing = (
        db.query(Vehiculo)
        .filter(Vehiculo.placa == payload.placa.upper(), Vehiculo.id != vehiculo_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe otro vehiculo con esa placa")

    tipo = db.get(TipoVehiculo, payload.tipo_vehiculo_id)
    if not tipo or not tipo.activo:
        raise HTTPException(status_code=400, detail="Tipo de vehiculo invalido")

    vehiculo.placa = payload.placa.upper()
    vehiculo.tipo_vehiculo_id = payload.tipo_vehiculo_id
    vehiculo.propietario = payload.propietario
    db.commit()
    db.refresh(vehiculo)
    return vehiculo


@router.delete("/{vehiculo_id}")
def delete_vehiculo(
    vehiculo_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    # Eliminar vehiculos: solo COINTRA_ADMIN (borrado logico)
    if not _is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo Cointra Admin puede eliminar vehiculos")

    vehiculo = db.get(Vehiculo, vehiculo_id)
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehiculo no encontrado")

    vehiculo.activo = False
    db.commit()
    return {"ok": True}

