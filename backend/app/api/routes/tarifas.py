from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, is_cointra_admin
from app.db.session import get_db
from app.models.catalogo_tarifa import CatalogoTarifa
from app.models.enums import UserRole
from app.models.servicio import Servicio
from app.models.tipo_vehiculo import TipoVehiculo
from app.models.usuario import Usuario
from app.schemas.servicio import CatalogoTarifaOut, CatalogoTarifaUpsert, CatalogoTarifaUpdate
from app.services.pricing import calculate_tarifa_tercero_from_cliente

router = APIRouter(prefix="/catalogo-tarifas", tags=["catalogo-tarifas"])


def _ensure_cointra_admin(user: Usuario) -> None:
    if not is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo COINTRA_ADMIN puede gestionar catalogo de tarifas")


def _to_out(row: CatalogoTarifa) -> dict:
    return {
        "id": row.id,
        "servicio_id": row.servicio_id,
        "tipo_vehiculo_id": row.tipo_vehiculo_id,
        "tarifa_cliente": float(row.tarifa_cliente),
        "rentabilidad_pct": float(row.rentabilidad_pct),
        "tarifa_tercero": float(row.tarifa_tercero),
        "activo": row.activo,
        "updated_by": row.updated_by,
        "servicio_nombre": row.servicio.nombre if row.servicio else None,
        "servicio_codigo": row.servicio.codigo if row.servicio else None,
        "tipo_vehiculo_nombre": row.tipo_vehiculo.nombre if row.tipo_vehiculo else None,
    }


@router.get("", response_model=list[CatalogoTarifaOut])
def list_catalogo_tarifas(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    _ensure_cointra_admin(user)

    rows = (
        db.query(CatalogoTarifa)
        .join(Servicio, Servicio.id == CatalogoTarifa.servicio_id)
        .join(TipoVehiculo, TipoVehiculo.id == CatalogoTarifa.tipo_vehiculo_id)
        .order_by(Servicio.nombre, TipoVehiculo.nombre)
        .all()
    )
    return [_to_out(row) for row in rows]


@router.get("/lookup")
def lookup_tarifa(
    servicio_id: int = Query(...),
    tipo_vehiculo_id: int = Query(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    row = (
        db.query(CatalogoTarifa)
        .filter(
            CatalogoTarifa.servicio_id == servicio_id,
            CatalogoTarifa.tipo_vehiculo_id == tipo_vehiculo_id,
            CatalogoTarifa.activo.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No hay tarifa configurada para ese servicio y tipo de vehiculo")

    if user.rol == UserRole.TERCERO:
        return {
            "tarifa": float(row.tarifa_tercero),
            "tarifa_tercero": float(row.tarifa_tercero),
            "servicio_id": row.servicio_id,
            "tipo_vehiculo_id": row.tipo_vehiculo_id,
        }

    if user.rol == UserRole.CLIENTE:
        return {
            "tarifa": float(row.tarifa_cliente),
            "tarifa_cliente": float(row.tarifa_cliente),
            "servicio_id": row.servicio_id,
            "tipo_vehiculo_id": row.tipo_vehiculo_id,
        }

    ganancia = float(row.tarifa_cliente) - float(row.tarifa_tercero)
    return {
        "tarifa": float(row.tarifa_cliente),
        "tarifa_cliente": float(row.tarifa_cliente),
        "tarifa_tercero": float(row.tarifa_tercero),
        "rentabilidad_pct": float(row.rentabilidad_pct),
        "ganancia_cointra": ganancia,
        "servicio_id": row.servicio_id,
        "tipo_vehiculo_id": row.tipo_vehiculo_id,
    }


@router.post("", response_model=CatalogoTarifaOut)
def upsert_catalogo_tarifa(
    payload: CatalogoTarifaUpsert,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    servicio = db.get(Servicio, payload.servicio_id)
    if not servicio or not servicio.activo:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    tipo = db.get(TipoVehiculo, payload.tipo_vehiculo_id)
    if not tipo or not tipo.activo:
        raise HTTPException(status_code=404, detail="Tipo de vehiculo no encontrado")

    tarifa_tercero = calculate_tarifa_tercero_from_cliente(payload.tarifa_cliente, payload.rentabilidad_pct)

    row = (
        db.query(CatalogoTarifa)
        .filter(
            CatalogoTarifa.servicio_id == payload.servicio_id,
            CatalogoTarifa.tipo_vehiculo_id == payload.tipo_vehiculo_id,
        )
        .first()
    )
    if row:
        if row.activo:
            raise HTTPException(
                status_code=400,
                detail="Esa tarifa ya existe para el servicio y tipo de vehiculo seleccionados",
            )
        raise HTTPException(
            status_code=400,
            detail="Ya existe una tarifa inactiva para este servicio y tipo de vehiculo. Reactivala desde la tabla.",
        )

    row = CatalogoTarifa(
        servicio_id=payload.servicio_id,
        tipo_vehiculo_id=payload.tipo_vehiculo_id,
        tarifa_cliente=payload.tarifa_cliente,
        rentabilidad_pct=payload.rentabilidad_pct,
        tarifa_tercero=tarifa_tercero,
        activo=True,
        updated_by=user.id,
        updated_at=datetime.utcnow(),
    )
    db.add(row)

    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.patch("/{catalogo_id}", response_model=CatalogoTarifaOut)
def update_catalogo_tarifa(
    catalogo_id: int,
    payload: CatalogoTarifaUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    row = db.get(CatalogoTarifa, catalogo_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro de tarifa no encontrado")

    data = payload.model_dump(exclude_unset=True)

    next_servicio_id = int(data.get("servicio_id", row.servicio_id))
    next_tipo_vehiculo_id = int(data.get("tipo_vehiculo_id", row.tipo_vehiculo_id))

    servicio = db.get(Servicio, next_servicio_id)
    if not servicio or not servicio.activo:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    tipo = db.get(TipoVehiculo, next_tipo_vehiculo_id)
    if not tipo or not tipo.activo:
        raise HTTPException(status_code=404, detail="Tipo de vehiculo no encontrado")

    duplicated = (
        db.query(CatalogoTarifa)
        .filter(
            CatalogoTarifa.servicio_id == next_servicio_id,
            CatalogoTarifa.tipo_vehiculo_id == next_tipo_vehiculo_id,
            CatalogoTarifa.id != catalogo_id,
        )
        .first()
    )
    if duplicated:
        raise HTTPException(
            status_code=400,
            detail="Ya existe una tarifa para ese servicio y tipo de vehiculo",
        )

    row.servicio_id = next_servicio_id
    row.tipo_vehiculo_id = next_tipo_vehiculo_id
    if "tarifa_cliente" in data and data["tarifa_cliente"] is not None:
        row.tarifa_cliente = data["tarifa_cliente"]
    if "rentabilidad_pct" in data and data["rentabilidad_pct"] is not None:
        row.rentabilidad_pct = data["rentabilidad_pct"]
    if "activo" in data and data["activo"] is not None:
        row.activo = bool(data["activo"])

    row.tarifa_tercero = calculate_tarifa_tercero_from_cliente(
        float(row.tarifa_cliente),
        float(row.rentabilidad_pct),
    )
    row.updated_by = user.id
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{catalogo_id}")
def deactivate_catalogo_tarifa(
    catalogo_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    row = db.get(CatalogoTarifa, catalogo_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro de tarifa no encontrado")

    row.activo = False
    row.updated_by = user.id
    row.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/{catalogo_id}/reactivar")
def reactivate_catalogo_tarifa(
    catalogo_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    _ensure_cointra_admin(user)

    row = db.get(CatalogoTarifa, catalogo_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro de tarifa no encontrado")

    row.activo = True
    row.updated_by = user.id
    row.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
