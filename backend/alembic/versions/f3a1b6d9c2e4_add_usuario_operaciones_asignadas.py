"""add usuario operaciones asignadas

Revision ID: f3a1b6d9c2e4
Revises: e1d4a6c9b2f3
Create Date: 2026-03-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a1b6d9c2e4"
down_revision: Union[str, None] = "e1d4a6c9b2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "usuario_operaciones_asignadas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("operacion_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["operacion_id"], ["operaciones.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("usuario_id", "operacion_id", name="uq_usuario_operacion_asignada"),
    )
    op.create_index(
        "ix_usuario_operaciones_asignadas_id",
        "usuario_operaciones_asignadas",
        ["id"],
        unique=False,
    )

    # Migracion de compatibilidad: conserva comportamiento historico
    # asignando a cada usuario CLIENTE todas las operaciones de su cliente.
    op.execute(
        """
        INSERT INTO usuario_operaciones_asignadas (usuario_id, operacion_id, created_at)
        SELECT u.id, o.id, CURRENT_TIMESTAMP
        FROM usuarios u
        JOIN operaciones o ON o.cliente_id = u.cliente_id
        WHERE u.rol = 'CLIENTE' AND u.cliente_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_usuario_operaciones_asignadas_id", table_name="usuario_operaciones_asignadas")
    op.drop_table("usuario_operaciones_asignadas")
