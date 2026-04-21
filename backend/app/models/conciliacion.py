from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ConciliacionEstado


class Conciliacion(Base):
    __tablename__ = "conciliaciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    operacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("operaciones.id"), nullable=False)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha_inicio: Mapped[datetime] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[datetime] = mapped_column(Date, nullable=False)
    estado: Mapped[ConciliacionEstado] = mapped_column(Enum(ConciliacionEstado), default=ConciliacionEstado.BORRADOR)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    borrador_guardado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enviada_facturacion: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    factura_cliente_enviada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    po_numero_autorizacion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    operacion = relationship("Operacion", back_populates="conciliaciones")
    creador = relationship("Usuario", back_populates="conciliaciones_creadas")
    items = relationship("ConciliacionItem", back_populates="conciliacion", cascade="all, delete-orphan")
    comentarios = relationship("Comentario", back_populates="conciliacion", cascade="all, delete-orphan")
    viajes = relationship("Viaje", back_populates="conciliacion")
    manifiestos = relationship("ConciliacionManifiesto", back_populates="conciliacion", cascade="all, delete-orphan")
    factura_archivos = relationship("FacturaArchivoCliente", back_populates="conciliacion", cascade="all, delete-orphan")
