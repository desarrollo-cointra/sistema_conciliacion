from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ServicioCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    requiere_origen_destino: bool = False


class ServicioUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    requiere_origen_destino: bool | None = None


class ServicioOut(ORMModel):
    id: int
    nombre: str
    codigo: str
    requiere_origen_destino: bool
    activo: bool
    created_by: int


class CatalogoTarifaUpsert(BaseModel):
    servicio_id: int
    tipo_vehiculo_id: int
    tarifa_cliente: float = Field(gt=0)
    rentabilidad_pct: float = Field(ge=0, le=99.99)


class CatalogoTarifaOut(ORMModel):
    id: int
    servicio_id: int
    tipo_vehiculo_id: int
    tarifa_cliente: float
    rentabilidad_pct: float
    tarifa_tercero: float
    activo: bool
    updated_by: int
    servicio_nombre: str | None = None
    servicio_codigo: str | None = None
    tipo_vehiculo_nombre: str | None = None
