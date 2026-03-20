from app.schemas.common import ORMModel
from pydantic import BaseModel, Field


class ClienteOut(ORMModel):
    id: int
    nombre: str
    nit: str
    activo: bool


class ClienteCreate(BaseModel):
    nombre: str
    nit: str


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    nit: str | None = None


class TerceroOut(ORMModel):
    id: int
    nombre: str
    nit: str
    activo: bool


class TerceroCreate(BaseModel):
    nombre: str
    nit: str


class TerceroUpdate(BaseModel):
    nombre: str | None = None
    nit: str | None = None


class OperacionOut(ORMModel):
    id: int
    cliente_id: int
    tercero_id: int
    nombre: str
    porcentaje_rentabilidad: float
    activa: bool
    cliente_usuario_ids: list[int] = []


class OperacionCreate(BaseModel):
    cliente_id: int
    tercero_id: int
    nombre: str
    porcentaje_rentabilidad: float = Field(default=10, ge=0, le=99.99)
    cliente_usuario_ids: list[int] = Field(default_factory=list)


class OperacionUpdate(BaseModel):
    cliente_id: int | None = None
    tercero_id: int | None = None
    nombre: str | None = None
    porcentaje_rentabilidad: float | None = Field(default=None, ge=0, le=99.99)
    cliente_usuario_ids: list[int] | None = None


class OperacionRentabilidadUpdate(BaseModel):
    porcentaje_rentabilidad: float = Field(ge=0, le=99.99)
