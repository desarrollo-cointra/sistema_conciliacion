from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.conciliacion import Conciliacion
from app.models.conciliacion_item import ConciliacionItem
from app.models.conciliacion_manifiesto import ConciliacionManifiesto
from app.models.enums import ItemEstado, UserRole
from app.models.historial_cambio import HistorialCambio
from app.models.operacion import Operacion
from app.models.servicio import Servicio
from app.models.usuario import Usuario
from app.models.usuario_operacion import usuario_operaciones_asignadas
from app.models.viaje import Viaje

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
try:
    TZ_COLOMBIA = ZoneInfo("America/Bogota")
except ZoneInfoNotFoundError:
    # Fallback for environments without tzdata (common on Windows).
    TZ_COLOMBIA = timezone(timedelta(hours=-5))

MESES_ES = {
    1: "enero",
    2: "febrero",
    3: "marzo",
    4: "abril",
    5: "mayo",
    6: "junio",
    7: "julio",
    8: "agosto",
    9: "septiembre",
    10: "octubre",
    11: "noviembre",
    12: "diciembre",
}
MESES_CORTOS_ES = {
    1: "ene",
    2: "feb",
    3: "mar",
    4: "abr",
    5: "may",
    6: "jun",
    7: "jul",
    8: "ago",
    9: "sep",
    10: "oct",
    11: "nov",
    12: "dic",
}


def _enum_text(value: object) -> str:
    return str(getattr(value, "value", value) or "")


def _resolve_period(mode: str, year: int | None, month: int | None) -> tuple[date, date, str]:
    today = date.today()
    normalized_mode = mode.strip().lower()

    if normalized_mode == "year_to_date":
        target_year = int(year or today.year)
        start = date(target_year, 1, 1)
        end = today if target_year == today.year else date(target_year, 12, 31)
        return start, end, f"Año {target_year} (acumulado)"

    if normalized_mode == "month_year":
        target_year = int(year or today.year)
        target_month = int(month or today.month)
        target_month = max(1, min(12, target_month))
        start = date(target_year, target_month, 1)
        if target_year == today.year and target_month == today.month:
            end = today
        else:
            end = date(target_year, target_month, monthrange(target_year, target_month)[1])
        return start, end, f"{MESES_ES[target_month].capitalize()} {target_year}"

    # current_month por defecto
    start = date(today.year, today.month, 1)
    return start, today, f"{MESES_ES[today.month].capitalize()} {today.year} (actual)"


def _get_accessible_operacion_ids(db: Session, user: Usuario) -> list[int]:
    if user.rol == UserRole.COINTRA:
        query = db.query(Operacion.id).filter(Operacion.activa.is_(True))
        return [row[0] for row in query.all()]

    if user.rol == UserRole.CLIENTE:
        query = (
            db.query(usuario_operaciones_asignadas.c.operacion_id)
            .join(Operacion, Operacion.id == usuario_operaciones_asignadas.c.operacion_id)
            .filter(usuario_operaciones_asignadas.c.usuario_id == user.id)
            .filter(Operacion.activa.is_(True))
        )
        return [row[0] for row in query.all()]

    if user.rol == UserRole.TERCERO and user.tercero_id:
        query = (
            db.query(Operacion.id)
            .filter(Operacion.tercero_id == user.tercero_id)
            .filter(Operacion.activa.is_(True))
        )
        rows = query.all()
        return [row[0] for row in rows]

    return []


def _safe_pct(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


def _created_date_colombia(conciliacion: Conciliacion) -> date | None:
    if conciliacion.created_at is None:
        return conciliacion.fecha_inicio

    created = conciliacion.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.astimezone(TZ_COLOMBIA).date()


def _summarize_items(items: list[tuple[ConciliacionItem, int]]) -> dict:
    total_servicios = len(items)
    total_ingresos = 0.0
    total_costos = 0.0
    placas_unicas: set[str] = set()
    estado_items = defaultdict(int)
    operacion_totales: dict[int, dict[str, float]] = defaultdict(lambda: {"servicios": 0.0, "ingresos": 0.0, "costos": 0.0})
    placa_totales: dict[str, dict[str, float]] = defaultdict(lambda: {"servicios": 0.0, "ingresos": 0.0, "costos": 0.0})

    for item, operacion_id in items:
        cliente = float(item.tarifa_cliente or 0)
        tercero = float(item.tarifa_tercero or 0)
        total_ingresos += cliente
        total_costos += tercero

        estado_items[_enum_text(item.estado)] += 1

        operacion_totales[operacion_id]["servicios"] += 1
        operacion_totales[operacion_id]["ingresos"] += cliente
        operacion_totales[operacion_id]["costos"] += tercero

        if item.placa:
            placa = str(item.placa).strip().upper()
            if placa:
                placas_unicas.add(placa)
                placa_totales[placa]["servicios"] += 1
                placa_totales[placa]["ingresos"] += cliente
                placa_totales[placa]["costos"] += tercero

    total_ganancia = total_ingresos - total_costos
    aprobados = float(estado_items.get(ItemEstado.APROBADO.value, 0))

    return {
        "total_servicios": total_servicios,
        "total_ingresos": round(total_ingresos, 2),
        "total_costos": round(total_costos, 2),
        "total_ganancia": round(total_ganancia, 2),
        "margen_pct": _safe_pct(total_ganancia, total_ingresos),
        "ticket_promedio": round(total_ingresos / total_servicios, 2) if total_servicios else 0.0,
        "aprobacion_items_pct": _safe_pct(aprobados, float(total_servicios)),
        "placas_unicas": len(placas_unicas),
        "estado_items": dict(estado_items),
        "operacion_totales": operacion_totales,
        "placa_totales": placa_totales,
    }


def _summarize_viajes(viajes: list[Viaje]) -> dict:
    total_servicios = len(viajes)
    total_ingresos = 0.0
    total_costos = 0.0
    placas_unicas: set[str] = set()
    operacion_totales: dict[int, dict[str, float]] = defaultdict(lambda: {"servicios": 0.0, "ingresos": 0.0, "costos": 0.0})
    placa_totales: dict[str, dict[str, float]] = defaultdict(lambda: {"servicios": 0.0, "ingresos": 0.0, "costos": 0.0})

    for viaje in viajes:
        cliente = float(viaje.tarifa_cliente or 0)
        tercero = float(viaje.tarifa_tercero or 0)
        total_ingresos += cliente
        total_costos += tercero

        operacion_totales[viaje.operacion_id]["servicios"] += 1
        operacion_totales[viaje.operacion_id]["ingresos"] += cliente
        operacion_totales[viaje.operacion_id]["costos"] += tercero

        placa = str(viaje.placa or "").strip().upper()
        if placa:
            placas_unicas.add(placa)
            placa_totales[placa]["servicios"] += 1
            placa_totales[placa]["ingresos"] += cliente
            placa_totales[placa]["costos"] += tercero

    total_ganancia = total_ingresos - total_costos
    return {
        "total_servicios": total_servicios,
        "total_ingresos": round(total_ingresos, 2),
        "total_costos": round(total_costos, 2),
        "total_ganancia": round(total_ganancia, 2),
        "margen_pct": _safe_pct(total_ganancia, total_ingresos),
        "ticket_promedio": round(total_ingresos / total_servicios, 2) if total_servicios else 0.0,
        "placas_unicas": len(placas_unicas),
        "operacion_totales": operacion_totales,
        "placa_totales": placa_totales,
    }


def _build_time_series(viajes: list[Viaje], start: date, end: date) -> list[dict]:
    use_daily = (end - start).days <= 70
    buckets: dict[str, dict[str, float]] = defaultdict(lambda: {"ingresos": 0.0, "costos": 0.0, "servicios": 0.0})

    for viaje in viajes:
        if use_daily:
            key = viaje.fecha_servicio.isoformat()
        else:
            key = f"{viaje.fecha_servicio.year}-{viaje.fecha_servicio.month:02d}"

        buckets[key]["ingresos"] += float(viaje.tarifa_cliente or 0)
        buckets[key]["costos"] += float(viaje.tarifa_tercero or 0)
        buckets[key]["servicios"] += 1

    if use_daily:
        cursor = start
        result: list[dict] = []
        while cursor <= end:
            key = cursor.isoformat()
            row = buckets.get(key) or {"ingresos": 0.0, "costos": 0.0, "servicios": 0.0}
            result.append(
                {
                    "label": f"{cursor.day:02d} {MESES_CORTOS_ES[cursor.month]}",
                    "date": key,
                    "ingresos": round(float(row["ingresos"]), 2),
                    "costos": round(float(row["costos"]), 2),
                    "ganancia": round(float(row["ingresos"] - row["costos"]), 2),
                    "servicios": int(row["servicios"]),
                }
            )
            cursor += timedelta(days=1)
        return result

    current = date(start.year, start.month, 1)
    end_month = date(end.year, end.month, 1)
    result = []
    while current <= end_month:
        key = f"{current.year}-{current.month:02d}"
        row = buckets.get(key) or {"ingresos": 0.0, "costos": 0.0, "servicios": 0.0}
        result.append(
            {
                "label": f"{MESES_CORTOS_ES[current.month]} {current.year}",
                "date": key,
                "ingresos": round(float(row["ingresos"]), 2),
                "costos": round(float(row["costos"]), 2),
                "ganancia": round(float(row["ingresos"] - row["costos"]), 2),
                "servicios": int(row["servicios"]),
            }
        )
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)

    return result


def _estado_visible_viaje(viaje: Viaje) -> str:
    estado = str(viaje.estado_conciliacion or "").strip().upper()
    if viaje.conciliado or estado in {"APROBADA", "CERRADA"}:
        return "CONCILIADO"
    if estado == "EN_REVISION":
        return "EN_REVISION"
    return "PENDIENTE"


def _build_empty_payload(mode: str, start: date, end: date, period_label: str, prev_start: date, prev_end: date) -> dict:
    return {
        "period": {
            "mode": mode,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "label": period_label,
            "compare_start_date": prev_start.isoformat(),
            "compare_end_date": prev_end.isoformat(),
        },
        "kpis": {
            "conciliaciones": 0,
            "servicios": 0,
            "manifiestos": 0,
            "ingresos": 0,
            "costos": 0,
            "ganancia": 0,
            "margen_pct": 0,
            "aprobacion_items_pct": 0,
            "ticket_promedio": 0,
            "placas_activas": 0,
            "variacion_ganancia_pct": 0,
            "viajes_pendientes": 0,
            "viajes_en_revision": 0,
            "viajes_conciliados": 0,
            "conc_borrador": 0,
            "conc_en_revision": 0,
            "conc_aprobada": 0,
            "conc_devuelta": 0,
            "conc_enviada_facturar": 0,
        },
        "charts": {
            "conciliaciones_estado": [],
            "items_estado": [],
            "items_tipo": [],
            "serie": [],
            "top_operaciones": [],
            "top_placas": [],
            "top_clientes": [],
            "top_terceros": [],
            "manifiestos_contexto": [],
        },
    }


@router.get("/indicadores")
def dashboard_indicadores(
    mode: str = Query(default="current_month"),
    year: int | None = Query(default=None, ge=2020, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    start, end, period_label = _resolve_period(mode, year, month)
    operacion_ids = _get_accessible_operacion_ids(db, user)

    days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)

    if not operacion_ids:
        return _build_empty_payload(mode, start, end, period_label, prev_start, prev_end)

    conc_base = db.query(Conciliacion).filter(
        Conciliacion.operacion_id.in_(operacion_ids),
        Conciliacion.activo.is_(True),
    )
    concs = [
        conc
        for conc in conc_base.all()
        if (created_date := _created_date_colombia(conc)) is not None and start <= created_date <= end
    ]
    conc_ids = [conc.id for conc in concs]

    if conc_ids:
        items_rows = (
            db.query(ConciliacionItem, Conciliacion.operacion_id)
            .join(Conciliacion, Conciliacion.id == ConciliacionItem.conciliacion_id)
            .filter(
                Conciliacion.id.in_(conc_ids),
                Conciliacion.activo.is_(True),
            )
            .all()
        )
        manifests = (
            db.query(ConciliacionManifiesto)
            .join(Conciliacion, Conciliacion.id == ConciliacionManifiesto.conciliacion_id)
            .filter(
                Conciliacion.id.in_(conc_ids),
                Conciliacion.activo.is_(True),
            )
            .all()
        )
    else:
        items_rows = []
        manifests = []

    viajes_query = db.query(Viaje).filter(
        Viaje.operacion_id.in_(operacion_ids),
        Viaje.activo.is_(True),
        Viaje.fecha_servicio >= start,
        Viaje.fecha_servicio <= end,
    )
    viajes = viajes_query.all()

    prev_viajes_query = db.query(Viaje).filter(
        Viaje.operacion_id.in_(operacion_ids),
        Viaje.activo.is_(True),
        Viaje.fecha_servicio >= prev_start,
        Viaje.fecha_servicio <= prev_end,
    )
    prev_viajes = prev_viajes_query.all()

    summary = _summarize_viajes(viajes)
    prev_summary = _summarize_viajes(prev_viajes)
    items_summary = _summarize_items(items_rows)

    devolucion_ids: set[int] = set()
    if conc_ids:
        devolucion_ids = {
            row[0]
            for row in db.query(HistorialCambio.conciliacion_id)
            .filter(
                HistorialCambio.conciliacion_id.in_(conc_ids),
                HistorialCambio.campo == "devolucion_cliente",
                HistorialCambio.conciliacion_id.is_not(None),
            )
            .all()
        }

    conc_borrador = 0
    conc_en_revision = 0
    conc_aprobada = 0
    conc_devuelta = 0
    conc_enviada_facturar = 0
    for conc in concs:
        estado = _enum_text(conc.estado).upper()

        if conc.enviada_facturacion:
            conc_enviada_facturar += 1
            continue
        if conc.id in devolucion_ids:
            conc_devuelta += 1
            continue

        if estado == "EN_REVISION":
            conc_en_revision += 1
            continue
        if estado in {"APROBADA", "CERRADA"}:
            conc_aprobada += 1
            continue
        conc_borrador += 1

    conc_estado_counts = {
        "BORRADOR": conc_borrador,
        "EN REVISION": conc_en_revision,
        "APROBADA": conc_aprobada,
        "DEVUELTA": conc_devuelta,
        "ENVIADA A FACTURAR": conc_enviada_facturar,
    }

    viajes_pendientes = 0
    viajes_en_revision = 0
    viajes_conciliados = 0
    for viaje in viajes:
        estado_viaje = _estado_visible_viaje(viaje)
        if estado_viaje == "CONCILIADO":
            viajes_conciliados += 1
        elif estado_viaje == "EN_REVISION":
            viajes_en_revision += 1
        else:
            viajes_pendientes += 1

    manifiestos_contexto = defaultdict(int)
    for row in manifests:
        contexto = _enum_text(row.contexto)
        manifiestos_contexto[contexto] += 1

    operaciones = db.query(Operacion).filter(Operacion.id.in_(operacion_ids)).all()
    operacion_map = {row.id: row for row in operaciones}

    top_operaciones = []
    for operacion_id, values in summary["operacion_totales"].items():
        ingresos = float(values["ingresos"])
        costos = float(values["costos"])
        operacion = operacion_map.get(operacion_id)
        top_operaciones.append(
            {
                "operacion_id": operacion_id,
                "label": operacion.nombre if operacion else f"Operación #{operacion_id}",
                "servicios": int(values["servicios"]),
                "ingresos": round(ingresos, 2),
                "costos": round(costos, 2),
                "ganancia": round(ingresos - costos, 2),
            }
        )
    top_operaciones.sort(key=lambda row: row["ganancia"], reverse=True)

    cliente_totales: dict[str, dict[str, float]] = defaultdict(lambda: {"servicios": 0.0, "ingresos": 0.0, "costos": 0.0})
    tercero_totales: dict[str, dict[str, float]] = defaultdict(lambda: {"servicios": 0.0, "ingresos": 0.0, "costos": 0.0})
    for viaje in viajes:
        operacion = operacion_map.get(viaje.operacion_id)
        cliente_nombre = operacion.cliente.nombre if operacion and operacion.cliente else "Sin cliente"
        tercero_nombre = operacion.tercero.nombre if operacion and operacion.tercero else "Sin tercero"
        cliente = float(viaje.tarifa_cliente or 0)
        tercero = float(viaje.tarifa_tercero or 0)

        cliente_totales[cliente_nombre]["servicios"] += 1
        cliente_totales[cliente_nombre]["ingresos"] += cliente
        cliente_totales[cliente_nombre]["costos"] += tercero

        tercero_totales[tercero_nombre]["servicios"] += 1
        tercero_totales[tercero_nombre]["ingresos"] += cliente
        tercero_totales[tercero_nombre]["costos"] += tercero

    top_placas = []
    for placa, values in summary["placa_totales"].items():
        ingresos = float(values["ingresos"])
        costos = float(values["costos"])
        top_placas.append(
            {
                "label": placa,
                "servicios": int(values["servicios"]),
                "ingresos": round(ingresos, 2),
                "costos": round(costos, 2),
                "ganancia": round(ingresos - costos, 2),
            }
        )
    top_placas.sort(key=lambda row: row["ganancia"], reverse=True)

    top_clientes = []
    for nombre, values in cliente_totales.items():
        ingresos = float(values["ingresos"])
        costos = float(values["costos"])
        top_clientes.append(
            {
                "label": nombre,
                "servicios": int(values["servicios"]),
                "ingresos": round(ingresos, 2),
                "costos": round(costos, 2),
                "ganancia": round(ingresos - costos, 2),
            }
        )
    top_clientes.sort(key=lambda row: row["ganancia"], reverse=True)

    top_terceros = []
    for nombre, values in tercero_totales.items():
        ingresos = float(values["ingresos"])
        costos = float(values["costos"])
        top_terceros.append(
            {
                "label": nombre,
                "servicios": int(values["servicios"]),
                "ingresos": round(ingresos, 2),
                "costos": round(costos, 2),
                "ganancia": round(ingresos - costos, 2),
            }
        )
    top_terceros.sort(key=lambda row: row["ganancia"], reverse=True)

    servicios_query = db.query(Servicio).filter(Servicio.activo.is_(True))
    servicios_catalogo = servicios_query.order_by(Servicio.nombre.asc()).all()

    servicios_por_id = {servicio.id: servicio for servicio in servicios_catalogo}
    conteo_servicios_tipo: dict[str, int] = {
        str(servicio.nombre or servicio.codigo).strip().upper(): 0
        for servicio in servicios_catalogo
    }
    for viaje in viajes:
        if not viaje.servicio_id:
            continue
        servicio = servicios_por_id.get(viaje.servicio_id)
        if not servicio:
            continue
        etiqueta = str(servicio.nombre or servicio.codigo).strip().upper()
        conteo_servicios_tipo[etiqueta] = int(conteo_servicios_tipo.get(etiqueta, 0) + 1)

    previous_ganancia = float(prev_summary["total_ganancia"])
    current_ganancia = float(summary["total_ganancia"])
    if previous_ganancia == 0:
        variacion_ganancia = 100.0 if current_ganancia > 0 else 0.0
    else:
        variacion_ganancia = round(((current_ganancia - previous_ganancia) / abs(previous_ganancia)) * 100, 2)

    return {
        "period": {
            "mode": mode,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "label": period_label,
            "compare_start_date": prev_start.isoformat(),
            "compare_end_date": prev_end.isoformat(),
        },
        "kpis": {
            "conciliaciones": conc_borrador + conc_en_revision + conc_aprobada + conc_devuelta + conc_enviada_facturar,
            "servicios": int(summary["total_servicios"]),
            "manifiestos": len(manifests),
            "ingresos": summary["total_ingresos"],
            "costos": summary["total_costos"],
            "ganancia": summary["total_ganancia"],
            "margen_pct": summary["margen_pct"],
            "aprobacion_items_pct": items_summary["aprobacion_items_pct"],
            "ticket_promedio": summary["ticket_promedio"],
            "placas_activas": int(summary["placas_unicas"]),
            "variacion_ganancia_pct": variacion_ganancia,
            "viajes_pendientes": viajes_pendientes,
            "viajes_en_revision": viajes_en_revision,
            "viajes_conciliados": viajes_conciliados,
            "conc_borrador": conc_borrador,
            "conc_en_revision": conc_en_revision,
            "conc_aprobada": conc_aprobada,
            "conc_devuelta": conc_devuelta,
            "conc_enviada_facturar": conc_enviada_facturar,
        },
        "charts": {
            "conciliaciones_estado": [
                {"label": key, "value": value}
                for key, value in conc_estado_counts.items()
            ],
            "items_estado": [
                {"label": key.replace("_", " "), "value": value}
                for key, value in sorted(items_summary["estado_items"].items(), key=lambda row: row[0])
            ],
            "items_tipo": [
                {"label": key, "value": value}
                for key, value in sorted(conteo_servicios_tipo.items(), key=lambda row: row[0])
            ],
            "manifiestos_contexto": [
                {
                    "label": "CONTRATO FIJO" if key == "LIQUIDACION_CONTRATO_FIJO" else "CONCILIACIÓN",
                    "value": value,
                }
                for key, value in sorted(manifiestos_contexto.items(), key=lambda row: row[0])
            ],
            "serie": _build_time_series(viajes, start, end),
            "top_operaciones": top_operaciones[:8],
            "top_placas": top_placas[:8],
            "top_clientes": top_clientes[:8],
            "top_terceros": top_terceros[:8],
        },
    }
