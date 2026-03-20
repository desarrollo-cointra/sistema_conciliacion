import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import ssl
from datetime import date
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings


_CACHE_LOCK = threading.Lock()
_AVANSAT_CACHE: dict[str, tuple[float, dict]] = {}


def _normalize_manifiesto(value: object) -> str:
    return str(value or "").strip()


def _strip_leading_zeros(value: str) -> str:
    stripped = value.lstrip("0")
    return stripped or "0"


def _cache_get(manifiesto: str) -> tuple[bool, dict]:
    now = time.time()
    with _CACHE_LOCK:
        hit = _AVANSAT_CACHE.get(manifiesto)
        if not hit:
            return False, {}
        expires_at, payload = hit
        if expires_at < now:
            _AVANSAT_CACHE.pop(manifiesto, None)
            return False, {}
        return True, payload


def _cache_set(manifiesto: str, payload: dict) -> None:
    ttl = max(int(settings.avansat_cache_ttl_seconds), 0)
    if ttl <= 0:
        return
    with _CACHE_LOCK:
        _AVANSAT_CACHE[manifiesto] = (time.time() + ttl, payload)


def _extract_candidate_records(payload: object) -> list[dict]:
    candidates: list[dict] = []

    if isinstance(payload, list):
        candidates.extend([row for row in payload if isinstance(row, dict)])
        return candidates

    if isinstance(payload, dict):
        if payload.get("manifiesto") is not None:
            candidates.append(payload)

        for key in ("data", "result", "results", "items", "records", "respuesta"):
            value = payload.get(key)
            if isinstance(value, list):
                candidates.extend([row for row in value if isinstance(row, dict)])
            elif isinstance(value, dict) and value.get("manifiesto") is not None:
                candidates.append(value)

    return candidates


def _pick(record: dict, *keys: str) -> str | None:
    for key in keys:
        val = record.get(key)
        if val is None:
            continue
        txt = str(val).strip()
        if txt:
            return txt
    return None


def _pick_from_remesas(remesas_dicts: list[dict], *keys: str) -> str | None:
    for remesa in remesas_dicts:
        for key in keys:
            val = remesa.get(key)
            if val is None:
                continue
            txt = str(val).strip()
            if txt:
                return txt
    return None


def _normalize_record_payload(record: dict) -> dict:
    remesas = record.get("remesas") if isinstance(record.get("remesas"), list) else []
    remesas_dicts = [row for row in remesas if isinstance(row, dict)]

    normalized_remesas: list[dict] = []
    for remesa in remesas_dicts:
        remesa_val = str(remesa.get("remesa") or remesa.get("numero_remesa") or "").strip()
        producto_val = str(remesa.get("producto") or remesa.get("mercancia") or remesa.get("material") or "").strip()
        if remesa_val or producto_val:
            normalized_remesas.append({"remesa": remesa_val, "producto": producto_val})

    return {
        "fecha_emision": _pick(record, "fecha_emision", "fecha_manifiesto", "fecha", "fecha_creacion"),
        "placa_vehiculo": _pick(record, "placa_vehiculo", "placa", "placa_cabezote"),
        "trayler": _pick(record, "trayler", "trailer", "remolque"),
        "remesa": _pick(record, "remesa", "numero_remesa") or _pick_from_remesas(remesas_dicts, "remesa", "numero_remesa"),
        "producto": (
            _pick(record, "producto", "producto_nombre", "nombre_producto", "mercancia", "material")
            or _pick_from_remesas(remesas_dicts, "producto", "mercancia", "material")
        ),
        "ciudad_origen": _pick(record, "ciudad_origen", "origen"),
        "ciudad_destino": _pick(record, "ciudad_destino", "destino"),
        "remesas": normalized_remesas,
    }


def _build_avansat_request(params: dict[str, str]) -> Request:
    base_params = {
        "aplicacion": settings.avansat_aplicacion,
        "type": settings.avansat_type,
        "user": settings.avansat_user,
        "pass": settings.avansat_pass,
    }
    merged = {**base_params, **params}
    url = f"{settings.avansat_url}?{urlencode(merged)}"
    req = Request(url, method="GET")
    if settings.avansat_auth_header:
        req.add_header("Authorization", settings.avansat_auth_header)
    return req


def _perform_avansat_request(params: dict[str, str]) -> object:
    req = _build_avansat_request(params)

    context = None
    if not settings.avansat_verify_ssl:
        context = ssl._create_unverified_context()

    timeout_seconds = int(settings.avansat_timeout_seconds)
    if timeout_seconds <= 0:
        with urlopen(req, context=context) as response:
            raw = response.read().decode("utf-8", errors="ignore")
    else:
        with urlopen(req, timeout=timeout_seconds, context=context) as response:
            raw = response.read().decode("utf-8", errors="ignore")
    return json.loads(raw)


def _find_record_by_manifiesto(payload: object, manifiesto: str) -> dict:
    target = _normalize_manifiesto(manifiesto)
    if not target:
        return {}

    candidates = _extract_candidate_records(payload)
    if not candidates:
        return {}

    for row in candidates:
        raw = _normalize_manifiesto(row.get("manifiesto") or row.get("numero_manifiesto"))
        if raw == target:
            return row

    target_no_zeros = _strip_leading_zeros(target)
    for row in candidates:
        raw = _normalize_manifiesto(row.get("manifiesto") or row.get("numero_manifiesto"))
        if raw and _strip_leading_zeros(raw) == target_no_zeros:
            return row

    return {}


def fetch_avansat_by_manifiesto(manifiesto: str | None) -> dict:
    value = (manifiesto or "").strip()
    if not value:
        return {}
    if not settings.avansat_enabled:
        return {}

    cached, cached_payload = _cache_get(value)
    if cached:
        return cached_payload

    try:
        payload = _perform_avansat_request({"manifiesto": value})
    except Exception:
        return {}

    if isinstance(payload, dict):
        code = str(payload.get("codigo") or payload.get("code") or "").strip()
        if code and code != "1000":
            return {}

    record = _find_record_by_manifiesto(payload, value)
    if not record:
        return {}

    result = _normalize_record_payload(record)
    _cache_set(value, result)
    return result


def fetch_avansat_by_created_date_range(start_date: date, end_date: date) -> dict[str, dict]:
    if not settings.avansat_enabled:
        return {}

    range_start = min(start_date, end_date)
    range_end = max(start_date, end_date)
    by_manifiesto: dict[str, dict] = {}

    payload = _perform_avansat_request(
        {
            "fechacreadoinicial": range_start.strftime("%Y-%m-%d"),
            "fechacreadofinal": range_end.strftime("%Y-%m-%d"),
        }
    )

    if isinstance(payload, dict):
        code = str(payload.get("codigo") or payload.get("code") or "").strip()
        if code and code != "1000":
            return {}

    records = _extract_candidate_records(payload)
    for record in records:
        manifiesto = _normalize_manifiesto(record.get("manifiesto") or record.get("numero_manifiesto"))
        if not manifiesto:
            continue
        by_manifiesto[manifiesto] = _normalize_record_payload(record)

    return by_manifiesto


def fetch_avansat_by_manifiestos_with_fallback(manifiestos: list[str]) -> dict[str, dict]:
    normalized = [
        _normalize_manifiesto(value)
        for value in manifiestos
        if _normalize_manifiesto(value)
    ]
    originals = list(dict.fromkeys(normalized))
    if not originals or not settings.avansat_enabled:
        return {}

    attempts_by_original: dict[str, list[str]] = {}
    candidates: list[str] = []
    seen_candidates: set[str] = set()
    for original in originals:
        raw_attempts = [original, _strip_leading_zeros(original)]
        unique_attempts: list[str] = []
        seen_attempts: set[str] = set()
        for attempt in raw_attempts:
            candidate = (attempt or "").strip()
            if not candidate or candidate in seen_attempts:
                continue
            seen_attempts.add(candidate)
            unique_attempts.append(candidate)
            if candidate not in seen_candidates:
                seen_candidates.add(candidate)
                candidates.append(candidate)
        attempts_by_original[original] = unique_attempts

    by_candidate: dict[str, dict] = {}
    max_workers = max(int(settings.avansat_max_workers), 1)
    if len(candidates) == 1 or max_workers == 1:
        for candidate in candidates:
            by_candidate[candidate] = fetch_avansat_by_manifiesto(candidate)
    else:
        with ThreadPoolExecutor(max_workers=min(max_workers, len(candidates))) as executor:
            futures = {executor.submit(fetch_avansat_by_manifiesto, candidate): candidate for candidate in candidates}
            for future in as_completed(futures):
                candidate = futures[future]
                try:
                    by_candidate[candidate] = future.result() or {}
                except Exception:
                    by_candidate[candidate] = {}

    resolved: dict[str, dict] = {}
    for original, attempts in attempts_by_original.items():
        for attempt in attempts:
            data = by_candidate.get(attempt) or {}
            if data:
                resolved[original] = data
                break

    # Segunda pasada secuencial para los manifiestos no resueltos en el barrido paralelo.
    unresolved = [original for original in originals if original not in resolved]
    for original in unresolved:
        attempts = attempts_by_original.get(original, [original])
        for attempt in attempts:
            data = fetch_avansat_by_manifiesto(attempt)
            if data:
                resolved[original] = data
                break
        if original not in resolved:
            # Breve respiro para no saturar Avansat cuando hay rate-limit transitorio.
            time.sleep(0.05)

    return resolved
