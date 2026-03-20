"""add contexto to conciliacion_manifiestos

Revision ID: c4a9e2d7f1b0
Revises: b8f9d1c2e4a7
Create Date: 2026-03-18 21:10:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c4a9e2d7f1b0"
down_revision = "b8f9d1c2e4a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conciliacion_manifiestos",
        sa.Column(
            "contexto",
            sa.String(length=40),
            nullable=False,
            server_default="CONCILIACION",
        ),
    )


def downgrade() -> None:
    op.drop_column("conciliacion_manifiestos", "contexto")
