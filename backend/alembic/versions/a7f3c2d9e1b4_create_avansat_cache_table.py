"""create avansat cache table

Revision ID: a7f3c2d9e1b4
Revises: e1d4a6c9b2f3
Create Date: 2026-03-19 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a7f3c2d9e1b4"
down_revision = "f3a1b6d9c2e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "avansat_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("manifiesto_numero", sa.String(length=100), nullable=False),
        sa.Column("fecha_emision", sa.String(length=100), nullable=True),
        sa.Column("placa_vehiculo", sa.String(length=50), nullable=True),
        sa.Column("trayler", sa.String(length=50), nullable=True),
        sa.Column("remesa", sa.String(length=100), nullable=True),
        sa.Column("producto", sa.String(length=255), nullable=True),
        sa.Column("ciudad_origen", sa.String(length=120), nullable=True),
        sa.Column("ciudad_destino", sa.String(length=120), nullable=True),
        sa.Column("remesas_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_avansat_cache_id"), "avansat_cache", ["id"], unique=False)
    op.create_index(
        op.f("ix_avansat_cache_manifiesto_numero"),
        "avansat_cache",
        ["manifiesto_numero"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_avansat_cache_manifiesto_numero"), table_name="avansat_cache")
    op.drop_index(op.f("ix_avansat_cache_id"), table_name="avansat_cache")
    op.drop_table("avansat_cache")
