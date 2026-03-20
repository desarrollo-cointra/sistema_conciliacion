"""add estado_conciliacion to viajes and backfill

Revision ID: add_estado_conciliacion_to_viajes
Revises: link_viajes_to_items_and_repair_states
Create Date: 2026-03-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_estado_conciliacion_to_viajes"
down_revision: Union[str, Sequence[str], None] = "link_viajes_to_items_and_repair_states"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("viajes") as batch_op:
        batch_op.add_column(sa.Column("estado_conciliacion", sa.String(length=20), nullable=True))

    conn = op.get_bind()
    meta = sa.MetaData()
    viajes = sa.Table("viajes", meta, autoload_with=conn)
    conciliaciones = sa.Table("conciliaciones", meta, autoload_with=conn)

    rows = conn.execute(
        sa.select(viajes.c.id, viajes.c.conciliacion_id, conciliaciones.c.estado)
        .select_from(viajes.outerjoin(conciliaciones, viajes.c.conciliacion_id == conciliaciones.c.id))
    ).fetchall()

    for row in rows:
        viaje_id = row[0]
        conc_id = row[1]
        estado = row[2] if conc_id is not None else None
        conciliado = bool(estado in ("APROBADA", "CERRADA"))
        conn.execute(
            sa.update(viajes)
            .where(viajes.c.id == viaje_id)
            .values(estado_conciliacion=estado, conciliado=conciliado)
        )


def downgrade() -> None:
    with op.batch_alter_table("viajes") as batch_op:
        batch_op.drop_column("estado_conciliacion")
