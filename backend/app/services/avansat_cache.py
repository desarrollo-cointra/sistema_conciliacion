from __future__ import annotations

from datetime import datetime, timedelta, date
import json

from sqlalchemy.orm import Session

from app.models.manifiesto_avansat import ManifiestoAvansat
from app.services.avansat import fetch_avansat_by_created_date_range, fetch_avansat_by_manifiestos_with_fallback


def _normalize_manifiesto(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.endswith(".0"):
        integer_part = raw[:-2]
        if integer_part.isdigit():
            return integer_part
    return raw


def _ensure_cache_table(db: Session) -> None:
    ManifiestoAvansat.__table__.create(bind=db.get_bind(), checkfirst=True)


def _cache_row_to_payload(row: ManifiestoAvansat) -> dict:
    remesas: list[dict] = []
    if row.remesas_json:
        try:
            parsed = json.loads(row.remesas_json)
            if isinstance(parsed, list):
                remesas = [item for item in parsed if isinstance(item, dict)]
        except Exception:
            remesas = []
    return {
        "fecha_emision": row.fecha_emision,
        "placa_vehiculo": row.placa_vehiculo,
        "trayler": row.trayler,
        "remesa": row.remesa,
        "producto": row.producto,
        "ciudad_origen": row.ciudad_origen,
        "ciudad_destino": row.ciudad_destino,
        "remesas": remesas,
    }


def _insert_if_missing_manifiesto(db: Session, manifiesto: str, payload: dict) -> bool:
    normalized = _normalize_manifiesto(manifiesto)
    if not normalized or not payload:
        return False

    row = (
        db.query(ManifiestoAvansat)
        .filter(ManifiestoAvansat.manifiesto_numero == normalized)
        .first()
    )
    if row is not None:
        return False

    row = ManifiestoAvansat(manifiesto_numero=normalized)
    db.add(row)

    row.fecha_emision = str(payload.get("fecha_emision") or "").strip() or None
    row.placa_vehiculo = str(payload.get("placa_vehiculo") or "").strip() or None
    row.trayler = str(payload.get("trayler") or "").strip() or None
    row.remesa = str(payload.get("remesa") or "").strip() or None
    row.producto = str(payload.get("producto") or "").strip() or None
    row.ciudad_origen = str(payload.get("ciudad_origen") or "").strip() or None
    row.ciudad_destino = str(payload.get("ciudad_destino") or "").strip() or None
    remesas = payload.get("remesas")
    row.remesas_json = json.dumps(remesas if isinstance(remesas, list) else [], ensure_ascii=True)
    row.created_at = datetime.utcnow()
    return True


def resolve_avansat_for_manifiestos(
    db: Session,
    manifiestos: list[str],
    max_age_minutes: int,
) -> tuple[dict[str, dict], list[str]]:
    _ensure_cache_table(db)
    normalized = [
        _normalize_manifiesto(value)
        for value in manifiestos
        if _normalize_manifiesto(value)
    ]
    unique_manifiestos = list(dict.fromkeys(normalized))
    if not unique_manifiestos:
        return {}, []

    cached_rows = (
        db.query(ManifiestoAvansat)
        .filter(ManifiestoAvansat.manifiesto_numero.in_(unique_manifiestos))
        .all()
    )
    cache_by_manifiesto = {row.manifiesto_numero: row for row in cached_rows}

    resolved: dict[str, dict] = {}
    to_refresh: list[str] = []
    for manifiesto in unique_manifiestos:
        row = cache_by_manifiesto.get(manifiesto)
        if row:
            payload = _cache_row_to_payload(row)
            if payload:
                resolved[manifiesto] = payload
                continue
        to_refresh.append(manifiesto)

    fetched = fetch_avansat_by_manifiestos_with_fallback(to_refresh)
    for manifiesto in to_refresh:
        data = fetched.get(manifiesto) or {}
        if data:
            resolved[manifiesto] = data
            _insert_if_missing_manifiesto(db, manifiesto, data)

    db.commit()
    missing = [manifiesto for manifiesto in unique_manifiestos if not resolved.get(manifiesto)]
    return resolved, missing


def resolve_avansat_from_cache_only(
    db: Session,
    manifiestos: list[str],
) -> tuple[dict[str, dict], list[str]]:
    _ensure_cache_table(db)
    normalized = [
        _normalize_manifiesto(value)
        for value in manifiestos
        if _normalize_manifiesto(value)
    ]
    unique_manifiestos = list(dict.fromkeys(normalized))
    if not unique_manifiestos:
        return {}, []

    cached_rows = (
        db.query(ManifiestoAvansat)
        .filter(ManifiestoAvansat.manifiesto_numero.in_(unique_manifiestos))
        .all()
    )
    cache_by_manifiesto = {row.manifiesto_numero: row for row in cached_rows}

    resolved: dict[str, dict] = {}
    missing: list[str] = []
    for manifiesto in unique_manifiestos:
        row = cache_by_manifiesto.get(manifiesto)
        if not row:
            missing.append(manifiesto)
            continue
        resolved[manifiesto] = _cache_row_to_payload(row)

    return resolved, missing


def previous_month_to_today_window() -> tuple[date, date]:
    today = date.today()
    first_day_current = today.replace(day=1)
    last_day_previous = first_day_current - timedelta(days=1)
    first_day_previous = last_day_previous.replace(day=1)
    return first_day_previous, today


def yesterday_today_window() -> tuple[date, date]:
    today = date.today()
    yesterday = today - timedelta(days=1)
    return yesterday, today


def sync_avansat_range_insert_only(
    db: Session,
    start_date: date,
    end_date: date,
) -> dict[str, int | str]:
    _ensure_cache_table(db)

    fetched_by_date = fetch_avansat_by_created_date_range(start_date, end_date)
    if not fetched_by_date:
        return {
            "total": 0,
            "inserted": 0,
            "skipped": 0,
            "start_date": min(start_date, end_date).isoformat(),
            "end_date": max(start_date, end_date).isoformat(),
        }

    manifests = list(fetched_by_date.keys())
    existing_rows = (
        db.query(ManifiestoAvansat.manifiesto_numero)
        .filter(ManifiestoAvansat.manifiesto_numero.in_(manifests))
        .all()
    )
    existing = {str(row[0]).strip() for row in existing_rows if str(row[0]).strip()}

    inserted = 0
    skipped = 0
    for manifiesto, payload in fetched_by_date.items():
        normalized = _normalize_manifiesto(manifiesto)
        if not normalized or not payload:
            continue
        if normalized in existing:
            skipped += 1
            continue
        if _insert_if_missing_manifiesto(db, normalized, payload):
            inserted += 1
            existing.add(normalized)
        else:
            skipped += 1

    db.commit()
    return {
        "total": len(fetched_by_date),
        "inserted": inserted,
        "skipped": skipped,
        "start_date": min(start_date, end_date).isoformat(),
        "end_date": max(start_date, end_date).isoformat(),
    }


def sync_avansat_previous_month_to_today(db: Session) -> dict[str, int | str]:
    start_date, end_date = previous_month_to_today_window()
    return sync_avansat_range_insert_only(db, start_date, end_date)


def sync_avansat_yesterday_today(db: Session) -> dict[str, int | str]:
    start_date, end_date = yesterday_today_window()
    return sync_avansat_range_insert_only(db, start_date, end_date)


def sync_recent_manifiestos_to_cache(
    db: Session,
    days_back: int = 60,
    max_age_minutes: int = 30,
) -> dict[str, int]:
    _ = (days_back, max_age_minutes)
    range_start, range_end = yesterday_today_window()
    result = sync_avansat_range_insert_only(db, range_start, range_end)
    return {
        "total": int(result["total"]),
        "resolved": int(result["inserted"]),
        "missing": int(result["skipped"]),
    }
