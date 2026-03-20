"""create manifiestos avansat table

Revision ID: b2d4f6a8c1e3
Revises: a7f3c2d9e1b4
Create Date: 2026-03-19 16:40:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b2d4f6a8c1e3"
down_revision = "a7f3c2d9e1b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "manifiestos_avansat",
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
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_manifiestos_avansat_id"), "manifiestos_avansat", ["id"], unique=False)
    op.create_index(
        op.f("ix_manifiestos_avansat_manifiesto_numero"),
        "manifiestos_avansat",
        ["manifiesto_numero"],
        unique=True,
    )

    op.execute(
        """
        INSERT INTO manifiestos_avansat (
            manifiesto_numero,
            fecha_emision,
            placa_vehiculo,
            trayler,
            remesa,
            producto,
            ciudad_origen,
            ciudad_destino,
            remesas_json,
            created_at
        )
        SELECT
            ac.manifiesto_numero,
            ac.fecha_emision,
            ac.placa_vehiculo,
            ac.trayler,
            ac.remesa,
            ac.producto,
            ac.ciudad_origen,
            ac.ciudad_destino,
            ac.remesas_json,
            COALESCE(ac.last_synced_at, ac.updated_at, CURRENT_TIMESTAMP)
        FROM avansat_cache ac
        WHERE NOT EXISTS (
            SELECT 1
            FROM manifiestos_avansat ma
            WHERE ma.manifiesto_numero = ac.manifiesto_numero
        )
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_manifiestos_avansat_manifiesto_numero"), table_name="manifiestos_avansat")
    op.drop_index(op.f("ix_manifiestos_avansat_id"), table_name="manifiestos_avansat")
    op.drop_table("manifiestos_avansat")
