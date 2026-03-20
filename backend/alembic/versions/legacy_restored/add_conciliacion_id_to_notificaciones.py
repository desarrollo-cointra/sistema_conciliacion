"""add conciliacion_id to notificaciones

Revision ID: add_conciliacion_id_to_notificaciones
Revises: add_sub_rol_to_usuarios
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_conciliacion_id_to_notificaciones"
down_revision: Union[str, Sequence[str], None] = "add_sub_rol_to_usuarios"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("notificaciones") as batch_op:
        batch_op.add_column(sa.Column("conciliacion_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("notificaciones") as batch_op:
        batch_op.drop_column("conciliacion_id")
