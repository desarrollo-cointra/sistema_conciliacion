from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ConciliacionManifiesto(Base):
    __tablename__ = "conciliacion_manifiestos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conciliacion_id: Mapped[int] = mapped_column(Integer, ForeignKey("conciliaciones.id"), nullable=False, index=True)
    manifiesto_numero: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    contexto: Mapped[str] = mapped_column(String(40), nullable=False, default="CONCILIACION")
    liquidacion_contrato_fijo_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    conciliacion = relationship("Conciliacion", back_populates="manifiestos")
    creador = relationship("Usuario")