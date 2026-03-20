"""add_origen_destino_to_servicios

Revision ID: d47f2c8d3a1f
Revises: cb60ea0c7a79
Create Date: 2026-03-18 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd47f2c8d3a1f'
down_revision = 'cb60ea0c7a79'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Agregar columnas origen y destino a servicios
    op.add_column('servicios', sa.Column('origen', sa.String(255), nullable=True))
    op.add_column('servicios', sa.Column('destino', sa.String(255), nullable=True))


def downgrade() -> None:
    # Remover columnas
    op.drop_column('servicios', 'destino')
    op.drop_column('servicios', 'origen')
