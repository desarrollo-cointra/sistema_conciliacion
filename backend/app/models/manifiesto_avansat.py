from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ManifiestoAvansat(Base):
    __tablename__ = "manifiestos_avansat"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    manifiesto_numero: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    fecha_emision: Mapped[str | None] = mapped_column(String(100), nullable=True)
    placa_vehiculo: Mapped[str | None] = mapped_column(String(50), nullable=True)
    trayler: Mapped[str | None] = mapped_column(String(50), nullable=True)
    remesa: Mapped[str | None] = mapped_column(String(100), nullable=True)
    producto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ciudad_origen: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ciudad_destino: Mapped[str | None] = mapped_column(String(120), nullable=True)
    remesas_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
