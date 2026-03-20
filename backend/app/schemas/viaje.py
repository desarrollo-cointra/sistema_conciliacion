from datetime import date, datetime, time

from pydantic import BaseModel

from app.schemas.common import ORMModel


class ViajeCreate(BaseModel):
    operacion_id: int
    servicio_id: int | None = None
    titulo: str
    fecha_servicio: date
    origen: str | None = None
    destino: str | None = None
    placa: str
    hora_inicio: time | None = None
    conductor: str | None = None
    tarifa_tercero: float | None = None
    tarifa_cliente: float | None = None
    manifiesto_numero: str | None = None
    descripcion: str | None = None


class ViajeOut(ORMModel):
    id: int
    operacion_id: int
    tercero_id: int
    servicio_id: int | None
    conciliacion_id: int | None
    titulo: str
    fecha_servicio: date
    origen: str
    destino: str
    placa: str
    hora_inicio: time | None
    hora_fin: time | None
    horas_cantidad: float | None
    conductor: str | None
    tarifa_tercero: float | None
    tarifa_cliente: float | None
    rentabilidad: float | None
    manifiesto_numero: str | None
    descripcion: str | None
    cargado_por: str
    conciliado: bool
    estado_conciliacion: str | None = None
    servicio_nombre: str | None = None
    servicio_codigo: str | None = None
    activo: bool
    created_by: int
    created_at: datetime


class ViajeUpdate(BaseModel):
    titulo: str | None = None
    fecha_servicio: date | None = None
    servicio_id: int | None = None
    origen: str | None = None
    destino: str | None = None
    placa: str | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    horas_cantidad: float | None = None
    conductor: str | None = None
    tarifa_tercero: float | None = None
    tarifa_cliente: float | None = None
    manifiesto_numero: str | None = None
    descripcion: str | None = None


class AdjuntarViajesRequest(BaseModel):
    viaje_ids: list[int]


class CargaMasivaResultado(BaseModel):
    total_filas: int
    cargados: int
    errores: list[str]
