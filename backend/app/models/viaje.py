from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Viaje(Base):
    __tablename__ = "viajes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    operacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("operaciones.id"), nullable=False)
    tercero_id: Mapped[int] = mapped_column(Integer, ForeignKey("terceros.id"), nullable=False)
    servicio_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("servicios.id"), nullable=True)
    conciliacion_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("conciliaciones.id"), nullable=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha_servicio: Mapped[date] = mapped_column(Date, nullable=False)
    origen: Mapped[str] = mapped_column(String(255), nullable=False)
    destino: Mapped[str] = mapped_column(String(255), nullable=False)
    placa: Mapped[str] = mapped_column(String(50), nullable=False)
    hora_inicio: Mapped[time | None] = mapped_column(Time, nullable=True)
    hora_fin: Mapped[time | None] = mapped_column(Time, nullable=True)
    horas_cantidad: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    conductor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tarifa_tercero: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    tarifa_cliente: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    rentabilidad: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    manifiesto_numero: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    cargado_por: Mapped[str] = mapped_column(String(20), nullable=False)
    conciliado: Mapped[bool] = mapped_column(Boolean, default=False)
    estado_conciliacion: Mapped[str | None] = mapped_column(String(20), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    operacion = relationship("Operacion")
    tercero = relationship("Tercero")
    servicio = relationship("Servicio")
    creador = relationship("Usuario")
    conciliacion = relationship("Conciliacion", back_populates="viajes", foreign_keys=[conciliacion_id])
