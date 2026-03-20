"""add borrador_guardado and liquidacion ref on manifiestos

Revision ID: e1d4a6c9b2f3
Revises: c4a9e2d7f1b0
Create Date: 2026-03-18 22:20:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e1d4a6c9b2f3"
down_revision = "c4a9e2d7f1b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conciliaciones",
        sa.Column("borrador_guardado", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "conciliacion_manifiestos",
        sa.Column("liquidacion_contrato_fijo_id", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conciliacion_manifiestos", "liquidacion_contrato_fijo_id")
    op.drop_column("conciliaciones", "borrador_guardado")
