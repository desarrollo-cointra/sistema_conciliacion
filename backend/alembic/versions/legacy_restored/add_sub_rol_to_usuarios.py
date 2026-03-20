"""add sub_rol to usuarios

Revision ID: add_sub_rol_to_usuarios
Revises: d19102f9ed50
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_sub_rol_to_usuarios"
down_revision: Union[str, Sequence[str], None] = "d19102f9ed50"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
  with op.batch_alter_table("usuarios") as batch_op:
      batch_op.add_column(sa.Column("sub_rol", sa.String(length=32), nullable=True))


def downgrade() -> None:
  with op.batch_alter_table("usuarios") as batch_op:
      batch_op.drop_column("sub_rol")

