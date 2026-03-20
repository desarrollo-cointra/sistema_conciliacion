"""add activo flag to viajes and conciliaciones

Revision ID: add_activo_to_viajes_and_conciliaciones
Revises: link_viajes_to_items_and_repair_states
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_activo_to_viajes_and_conciliaciones"
down_revision: Union[str, Sequence[str], None] = "link_viajes_to_items_and_repair_states"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("viajes") as batch_op:
        batch_op.add_column(sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()))

    with op.batch_alter_table("conciliaciones") as batch_op:
        batch_op.add_column(sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    with op.batch_alter_table("conciliaciones") as batch_op:
        batch_op.drop_column("activo")

    with op.batch_alter_table("viajes") as batch_op:
        batch_op.drop_column("activo")
