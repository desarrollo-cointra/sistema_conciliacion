from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, exists

from app.api.deps import get_current_user, is_cointra_admin
from app.core.config import settings
from app.db.session import get_db
from app.models.conciliacion_item import ConciliacionItem
from app.models.conciliacion_manifiesto import ConciliacionManifiesto
from app.models.manifiesto_avansat import ManifiestoAvansat
from app.models.enums import UserRole
from app.models.usuario import Usuario
from app.services.avansat import fetch_avansat_by_manifiesto
from app.services.avansat_cache import sync_avansat_previous_month_to_today, sync_avansat_yesterday_today

router = APIRouter(prefix="/avansat", tags=["avansat"])


class AvansatLookupOut(BaseModel):
    manifiesto: str
    encontrado: bool
    fecha_emision: str | None = None
    producto: str | None = None
    placa_vehiculo: str | None = None
    trayler: str | None = None
    remesa: str | None = None
    ciudad_origen: str | None = None
    ciudad_destino: str | None = None


class AvansatSyncOut(BaseModel):
    total: int
    inserted: int
    skipped: int
    start_date: str
    end_date: str


class AvansatCacheStatsOut(BaseModel):
    total_cached: int
    total_con_conciliacion: int


class AvansatCacheRowOut(BaseModel):
    manifiesto_numero: str
    estado: str = "SINCRONIZADO"
    conciliacion_id: int | None = None
    conciliacion_contexto: str | None = None
    fecha_emision: str | None = None
    placa_vehiculo: str | None = None
    trayler: str | None = None
    remesa: str | None = None
    producto: str | None = None
    ciudad_origen: str | None = None
    ciudad_destino: str | None = None
    created_at: str | None = None


class AvansatCacheListOut(BaseModel):
    total: int
    page: int
    page_size: int
    rows: list[AvansatCacheRowOut]


@router.get("/manifiesto/{manifiesto}", response_model=AvansatLookupOut)
def consultar_manifiesto(
    manifiesto: str,
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede consultar Avansat")

    value = manifiesto.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Debes enviar un manifiesto valido")

    if not settings.avansat_enabled:
        raise HTTPException(
            status_code=503,
            detail="La integracion con Avansat esta deshabilitada. Configura AVANSAT_ENABLED y credenciales en backend/.env.",
        )

    data = fetch_avansat_by_manifiesto(value)
    return AvansatLookupOut(manifiesto=value, encontrado=bool(data), **data)


@router.post("/sync-mes-anterior", response_model=AvansatSyncOut)
def sync_mes_anterior_avansat(
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if not is_cointra_admin(user):
        raise HTTPException(status_code=403, detail="Solo COINTRA_ADMIN puede sincronizar desde mes anterior")

    if not settings.avansat_enabled:
        raise HTTPException(status_code=503, detail="Avansat deshabilitado en configuracion")

    return AvansatSyncOut(**sync_avansat_previous_month_to_today(db))


@router.post("/sync-ayer-hoy", response_model=AvansatSyncOut)
def sync_ayer_hoy_avansat(
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo usuarios Cointra pueden sincronizar Avansat")

    if not settings.avansat_enabled:
        raise HTTPException(status_code=503, detail="Avansat deshabilitado en configuracion")

    return AvansatSyncOut(**sync_avansat_yesterday_today(db))


@router.post("/sync-cache", response_model=AvansatSyncOut)
def sync_cache_avansat_legacy(
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo usuarios Cointra pueden sincronizar Avansat")

    if not settings.avansat_enabled:
        raise HTTPException(status_code=503, detail="Avansat deshabilitado en configuracion")

    return AvansatSyncOut(**sync_avansat_yesterday_today(db))


@router.get("/cache-stats", response_model=AvansatCacheStatsOut)
def avansat_cache_stats(
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede consultar cache de Avansat")

    total = db.query(ManifiestoAvansat).count()
    total_con_conciliacion = (
        db.query(ManifiestoAvansat)
        .filter(exists().where(ConciliacionItem.manifiesto_numero == ManifiestoAvansat.manifiesto_numero))
        .count()
    )
    return AvansatCacheStatsOut(total_cached=total, total_con_conciliacion=total_con_conciliacion)


@router.get("/cache", response_model=AvansatCacheListOut)
def avansat_cache_list(
    manifiesto: str | None = Query(default=None),
    fecha_emision: str | None = Query(default=None),
    placa_vehiculo: str | None = Query(default=None),
    trayler: str | None = Query(default=None),
    remesa: str | None = Query(default=None),
    producto: str | None = Query(default=None),
    ciudad_origen: str | None = Query(default=None),
    ciudad_destino: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    conciliacion_id: int | None = Query(default=None, ge=1),
    has_conciliacion: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=10, le=500),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if user.rol != UserRole.COINTRA:
        raise HTTPException(status_code=403, detail="Solo Cointra puede consultar cache de Avansat")

    estado_normalized = (estado or "").strip().upper()
    if estado_normalized and estado_normalized != "SINCRONIZADO":
        return AvansatCacheListOut(total=0, page=page, page_size=page_size, rows=[])

    query = db.query(ManifiestoAvansat)
    if conciliacion_id is not None:
        query = query.join(
            ConciliacionItem,
            ConciliacionItem.manifiesto_numero == ManifiestoAvansat.manifiesto_numero,
        ).filter(ConciliacionItem.conciliacion_id == conciliacion_id)
    if has_conciliacion is True:
        query = query.filter(
            exists().where(ConciliacionItem.manifiesto_numero == ManifiestoAvansat.manifiesto_numero)
        )
    elif has_conciliacion is False:
        query = query.filter(
            ~exists().where(ConciliacionItem.manifiesto_numero == ManifiestoAvansat.manifiesto_numero)
        )
    if manifiesto:
        query = query.filter(ManifiestoAvansat.manifiesto_numero.contains(manifiesto.strip()))
    if fecha_emision:
        query = query.filter(ManifiestoAvansat.fecha_emision.contains(fecha_emision.strip()))
    if placa_vehiculo:
        query = query.filter(ManifiestoAvansat.placa_vehiculo.contains(placa_vehiculo.strip().upper()))
    if trayler:
        query = query.filter(ManifiestoAvansat.trayler.contains(trayler.strip().upper()))
    if remesa:
        query = query.filter(ManifiestoAvansat.remesa.contains(remesa.strip()))
    if producto:
        query = query.filter(ManifiestoAvansat.producto.contains(producto.strip()))
    if ciudad_origen:
        query = query.filter(ManifiestoAvansat.ciudad_origen.contains(ciudad_origen.strip()))
    if ciudad_destino:
        query = query.filter(ManifiestoAvansat.ciudad_destino.contains(ciudad_destino.strip()))

    total = query.count()
    offset = (page - 1) * page_size
    rows = (
        query
        .order_by(desc(ManifiestoAvansat.created_at))
        .offset(offset)
        .limit(page_size)
        .all()
    )

    manifest_numbers = [row.manifiesto_numero for row in rows]
    conciliacion_by_manifest: dict[str, tuple[int, str | None]] = {}
    if manifest_numbers:
        links = (
            db.query(
                ConciliacionItem.manifiesto_numero,
                ConciliacionItem.conciliacion_id,
            )
            .filter(
                ConciliacionItem.manifiesto_numero.in_(manifest_numbers),
                ConciliacionItem.manifiesto_numero.isnot(None),
            )
            .all()
        )
        for link in links:
            conciliacion_by_manifest[link.manifiesto_numero] = (link.conciliacion_id, None)

    payload_rows = [
        AvansatCacheRowOut(
            manifiesto_numero=row.manifiesto_numero,
            estado="SINCRONIZADO",
            conciliacion_id=(conciliacion_by_manifest.get(row.manifiesto_numero) or (None, None))[0],
            conciliacion_contexto=(conciliacion_by_manifest.get(row.manifiesto_numero) or (None, None))[1],
            fecha_emision=row.fecha_emision,
            placa_vehiculo=row.placa_vehiculo,
            trayler=row.trayler,
            remesa=row.remesa,
            producto=row.producto,
            ciudad_origen=row.ciudad_origen,
            ciudad_destino=row.ciudad_destino,
            created_at=row.created_at.isoformat() if row.created_at else None,
        )
        for row in rows
    ]
    return AvansatCacheListOut(total=total, page=page, page_size=page_size, rows=payload_rows)
