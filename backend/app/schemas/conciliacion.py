from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import ConciliacionEstado, ItemEstado, ItemTipo
from app.schemas.common import ORMModel
from app.schemas.historial import HistorialCambioOut, ResumenFinancieroOut


class ConciliacionCreate(BaseModel):
    operacion_id: int
    nombre: str
    fecha_inicio: date
    fecha_fin: date


class ConciliacionUpdateEstado(BaseModel):
    estado: ConciliacionEstado


class ConciliacionWorkflowAction(BaseModel):
    observacion: str | None = None


class ConciliacionHistorialFilter(BaseModel):
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    cliente_id: int | None = None
    tercero_id: int | None = None


class ConciliacionOut(ORMModel):
    id: int
    operacion_id: int
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    estado: ConciliacionEstado
    created_by: int
    created_at: datetime


class ConciliacionItemCreate(BaseModel):
    conciliacion_id: int
    tipo: ItemTipo
    fecha_servicio: date
    origen: str | None = None
    destino: str | None = None
    placa: str | None = None
    conductor: str | None = None
    tarifa_tercero: float | None = None
    tarifa_cliente: float | None = None
    manifiesto_numero: str | None = None
    remesa: str | None = None
    descripcion: str | None = None


class ConciliacionItemUpdateEstado(BaseModel):
    estado: ItemEstado


class ConciliacionItemPatch(BaseModel):
    manifiesto_numero: str | None = None
    remesa: str | None = None
    tarifa_tercero: float | None = None
    tarifa_cliente: float | None = None
    rentabilidad: float | None = None


class ClienteItemDecision(BaseModel):
    estado: ItemEstado
    comentario: str | None = None


class ConciliacionItemOut(ORMModel):
    id: int
    conciliacion_id: int
    tipo: ItemTipo
    estado: ItemEstado
    fecha_servicio: date
    origen: str | None
    destino: str | None
    placa: str | None
    conductor: str | None
    tarifa_tercero: float | None
    tarifa_cliente: float | None
    rentabilidad: float | None
    manifiesto_numero: str | None
    remesa: str | None
    cargado_por: str
    descripcion: str | None
    created_by: int
    created_at: datetime


class ComentarioCreate(BaseModel):
    conciliacion_id: int
    item_id: int | None = None
    comentario: str


class ComentarioOut(ORMModel):
    id: int
    conciliacion_id: int
    item_id: int | None
    usuario_id: int
    comentario: str
    created_at: datetime
