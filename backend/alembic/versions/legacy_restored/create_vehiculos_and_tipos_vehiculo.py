"""create tipos_vehiculo and vehiculos

Revision ID: create_vehiculos_and_tipos_vehiculo
Revises: add_sub_rol_to_usuarios
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "create_vehiculos_and_tipos_vehiculo"
down_revision: Union[str, Sequence[str], None] = "add_sub_rol_to_usuarios"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tipos_vehiculo",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False, unique=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "vehiculos",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("placa", sa.String(length=20), nullable=False),
        sa.Column("tipo_vehiculo_id", sa.Integer(), nullable=False),
        sa.Column("propietario", sa.String(length=255), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["tipo_vehiculo_id"], ["tipos_vehiculo.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["usuarios.id"]),
    )
    op.create_index("ix_vehiculos_placa", "vehiculos", ["placa"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_vehiculos_placa", table_name="vehiculos")
    op.drop_table("vehiculos")
    op.drop_table("tipos_vehiculo")

