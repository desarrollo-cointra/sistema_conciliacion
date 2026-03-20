"""add tercero_id to vehiculos

Revision ID: add_tercero_id_to_vehiculos
Revises: add_conciliacion_id_to_notificaciones
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_tercero_id_to_vehiculos"
down_revision: Union[str, Sequence[str], None] = "add_conciliacion_id_to_notificaciones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("vehiculos") as batch_op:
        batch_op.add_column(sa.Column("tercero_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("vehiculos") as batch_op:
        batch_op.drop_column("tercero_id")
