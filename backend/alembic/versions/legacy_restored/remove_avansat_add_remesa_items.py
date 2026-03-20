"""remove avansat fields and add remesa in conciliacion_items

Revision ID: remove_avansat_add_remesa_items
Revises: create_vehiculos_and_tipos_vehiculo
Create Date: 2026-03-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "remove_avansat_add_remesa_items"
down_revision: Union[str, Sequence[str], None] = "create_vehiculos_and_tipos_vehiculo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("conciliacion_items") as batch_op:
        batch_op.drop_column("manifiesto_avansat_id")
        batch_op.add_column(sa.Column("remesa", sa.String(length=100), nullable=True))

    with op.batch_alter_table("viajes") as batch_op:
        batch_op.drop_column("manifiesto_avansat_id")


def downgrade() -> None:
    with op.batch_alter_table("viajes") as batch_op:
        batch_op.add_column(sa.Column("manifiesto_avansat_id", sa.String(length=100), nullable=True))

    with op.batch_alter_table("conciliacion_items") as batch_op:
        batch_op.drop_column("remesa")
        batch_op.add_column(sa.Column("manifiesto_avansat_id", sa.String(length=100), nullable=True))
