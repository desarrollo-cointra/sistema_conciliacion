from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import ConciliacionEstado, ItemEstado, ItemTipo
from app.schemas.common import ORMModel
from app.schemas.historial import HistorialCambioOut, ResumenFinancieroOut


class ConciliacionCreate(BaseModel):
    operacion_id: int
    nombre: str
    fecha_inicio: date
    fecha_fin: date


class ConciliacionUpdate(BaseModel):
    operacion_id: int | None = None
    nombre: str | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None


class ConciliacionUpdateEstado(BaseModel):
    estado: ConciliacionEstado


class ConciliacionWorkflowAction(BaseModel):
    observacion: str | None = None
    destinatario_email: str | None = None
    mensaje: str | None = None


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
    activo: bool
    borrador_guardado: bool = False
    enviada_facturacion: bool = False
    created_by: int
    created_at: datetime
    creador_nombre: str | None = None
    cliente_nombre: str | None = None
    tercero_nombre: str | None = None
    estado_actualizado_por_nombre: str | None = None
    estado_actualizado_por_email: str | None = None


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
    placa: str | None = None
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
    viaje_id: int | None = None
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
    servicio_nombre: str | None = None
    servicio_codigo: str | None = None
    horas_cantidad: float | None = None
    liquidacion_contrato_fijo: bool = False
    liquidacion_contrato_fijo_id: int | None = None
    liquidacion_periodo_inicio: date | None = None
    liquidacion_periodo_fin: date | None = None
    liquidacion_es_relevo: bool = False
    liquidacion_relevo_con_valor: bool | None = None
    created_by: int
    created_at: datetime


class LiquidacionContratoFijoCreate(BaseModel):
    liquidacion_id: int | None = Field(default=None, ge=1)
    periodo_inicio: date
    periodo_fin: date
    placas: list[str] = Field(min_length=1)
    valor_tercero: float = Field(gt=0)
    incluir_conductor_relevo: bool = False
    relevo_con_valor: bool = False
    valor_tercero_relevo: float | None = Field(default=None, ge=0)


ConciliacionManifiestoContexto = Literal["CONCILIACION", "LIQUIDACION_CONTRATO_FIJO"]


class ConciliacionManifiestoCreate(BaseModel):
    manifiesto_numero: str
    contexto: ConciliacionManifiestoContexto = "CONCILIACION"
    liquidacion_contrato_fijo_id: int | None = Field(default=None, ge=1)


class ConciliacionManifiestoUpdate(BaseModel):
    manifiesto_numero: str


class ConciliacionManifiestoOut(ORMModel):
    id: int
    conciliacion_id: int
    manifiesto_numero: str
    contexto: ConciliacionManifiestoContexto
    liquidacion_contrato_fijo_id: int | None = None
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
