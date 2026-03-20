"""remove origen/destino from servicios and add requiere_origen_destino

Revision ID: b8f9d1c2e4a7
Revises: d47f2c8d3a1f
Create Date: 2026-03-18 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b8f9d1c2e4a7"
down_revision = "d47f2c8d3a1f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "servicios",
        sa.Column("requiere_origen_destino", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Migración de datos para mantener comportamiento en servicios existentes.
    op.execute(
        """
        UPDATE servicios
        SET requiere_origen_destino = 1
        WHERE UPPER(codigo) IN ('VIAJE', 'VIAJE_ADICIONAL', 'VIAJE_EXTRA', 'PEAJE', 'PEAJES')
        """
    )

    op.drop_column("servicios", "destino")
    op.drop_column("servicios", "origen")


def downgrade() -> None:
    op.add_column("servicios", sa.Column("origen", sa.String(length=255), nullable=True))
    op.add_column("servicios", sa.Column("destino", sa.String(length=255), nullable=True))
    op.drop_column("servicios", "requiere_origen_destino")
