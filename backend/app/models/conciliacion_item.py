from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ItemEstado, ItemTipo


class ConciliacionItem(Base):
    __tablename__ = "conciliacion_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conciliacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("conciliaciones.id"), nullable=False)
    tipo: Mapped[ItemTipo] = mapped_column(Enum(ItemTipo), nullable=False)
    estado: Mapped[ItemEstado] = mapped_column(Enum(ItemEstado), default=ItemEstado.PENDIENTE)
    fecha_servicio: Mapped[date] = mapped_column(Date, nullable=False)
    origen: Mapped[str | None] = mapped_column(String(255), nullable=True)
    destino: Mapped[str | None] = mapped_column(String(255), nullable=True)
    placa: Mapped[str | None] = mapped_column(String(50), nullable=True)
    conductor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tarifa_tercero: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    tarifa_cliente: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    rentabilidad: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    manifiesto_numero: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remesa: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cargado_por: Mapped[str] = mapped_column(String(20), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conciliacion = relationship("Conciliacion", back_populates="items")
    creador = relationship("Usuario", back_populates="items_creados")
    comentarios = relationship("Comentario", back_populates="item")
