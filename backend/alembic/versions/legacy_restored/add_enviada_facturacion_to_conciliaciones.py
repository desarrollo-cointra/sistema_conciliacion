"""add enviada_facturacion flag to conciliaciones

Revision ID: add_enviada_facturacion_to_conciliaciones
Revises: add_activo_to_viajes_and_conciliaciones
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_enviada_facturacion_to_conciliaciones"
down_revision: Union[str, Sequence[str], None] = "add_activo_to_viajes_and_conciliaciones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("conciliaciones") as batch_op:
        batch_op.add_column(sa.Column("enviada_facturacion", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("conciliaciones") as batch_op:
        batch_op.drop_column("enviada_facturacion")
