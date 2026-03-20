from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CointraSubRol, UserRole
from app.models.usuario_operacion import usuario_operaciones_asignadas


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    sub_rol: Mapped[CointraSubRol | None] = mapped_column(Enum(CointraSubRol), nullable=True)
    cliente_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("clientes.id"), nullable=True)
    tercero_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("terceros.id"), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    cliente = relationship("Cliente", back_populates="usuarios")
    tercero = relationship("Tercero", back_populates="usuarios")
    conciliaciones_creadas = relationship("Conciliacion", back_populates="creador")
    items_creados = relationship("ConciliacionItem", back_populates="creador")
    comentarios = relationship("Comentario", back_populates="usuario")
    operaciones_asignadas = relationship(
        "Operacion",
        secondary=usuario_operaciones_asignadas,
        back_populates="usuarios_cliente_asignados",
    )
