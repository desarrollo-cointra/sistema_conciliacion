from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.usuario_operacion import usuario_operaciones_asignadas


class Operacion(Base):
    __tablename__ = "operaciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(Integer, ForeignKey("clientes.id"), nullable=False)
    tercero_id: Mapped[int] = mapped_column(Integer, ForeignKey("terceros.id"), nullable=False)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    porcentaje_rentabilidad: Mapped[float] = mapped_column(Numeric(10, 2), default=10)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)

    cliente = relationship("Cliente", back_populates="operaciones")
    tercero = relationship("Tercero", back_populates="operaciones")
    conciliaciones = relationship("Conciliacion", back_populates="operacion")
    usuarios_cliente_asignados = relationship(
        "Usuario",
        secondary=usuario_operaciones_asignadas,
        back_populates="operaciones_asignadas",
    )
