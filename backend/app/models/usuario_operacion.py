from sqlalchemy import Column, DateTime, ForeignKey, Integer, Table, UniqueConstraint, func

from app.db.base import Base


usuario_operaciones_asignadas = Table(
    "usuario_operaciones_asignadas",
    Base.metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False),
    Column("operacion_id", Integer, ForeignKey("operaciones.id", ondelete="CASCADE"), nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
    UniqueConstraint("usuario_id", "operacion_id", name="uq_usuario_operacion_asignada"),
)
