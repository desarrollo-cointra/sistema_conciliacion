from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CatalogoTarifa(Base):
    __tablename__ = "catalogo_tarifas"
    __table_args__ = (
        UniqueConstraint("servicio_id", "tipo_vehiculo_id", name="uq_catalogo_tarifa_servicio_tipo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    servicio_id: Mapped[int] = mapped_column(Integer, ForeignKey("servicios.id"), nullable=False, index=True)
    tipo_vehiculo_id: Mapped[int] = mapped_column(Integer, ForeignKey("tipos_vehiculo.id"), nullable=False, index=True)
    tarifa_cliente: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    rentabilidad_pct: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    tarifa_tercero: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    servicio = relationship("Servicio")
    tipo_vehiculo = relationship("TipoVehiculo")
    editor = relationship("Usuario")
