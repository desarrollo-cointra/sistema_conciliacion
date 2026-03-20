"""link viajes to conciliacion_items and repair conciliado states

Revision ID: link_viajes_to_items_and_repair_states
Revises: remove_avansat_add_remesa_items
Create Date: 2026-03-16

"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "link_viajes_to_items_and_repair_states"
down_revision: Union[str, Sequence[str], None] = "remove_avansat_add_remesa_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("conciliacion_items") as batch_op:
        batch_op.add_column(sa.Column("viaje_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_conciliacion_items_viaje_id", "viajes", ["viaje_id"], ["id"])
        batch_op.create_index("ix_conciliacion_items_viaje_id", ["viaje_id"], unique=False)

    conn = op.get_bind()
    meta = sa.MetaData()

    viajes = sa.Table("viajes", meta, autoload_with=conn)
    conciliaciones = sa.Table("conciliaciones", meta, autoload_with=conn)
    items = sa.Table("conciliacion_items", meta, autoload_with=conn)

    # 1) Reparar campo conciliado segun estado real de la conciliacion
    rows = conn.execute(
        sa.select(viajes.c.id, viajes.c.conciliacion_id, conciliaciones.c.estado)
        .select_from(viajes.outerjoin(conciliaciones, viajes.c.conciliacion_id == conciliaciones.c.id))
    ).fetchall()

    for row in rows:
        viaje_id = row[0]
        conc_id = row[1]
        estado = row[2]
        esperado = bool(conc_id is not None and estado in ("APROBADA", "CERRADA"))
        conn.execute(sa.update(viajes).where(viajes.c.id == viaje_id).values(conciliado=esperado))

    # 2) Backfill viaje_id para items VIAJE existentes (match por datos principales)
    used_viaje_ids = {
        r[0]
        for r in conn.execute(
            sa.select(items.c.viaje_id).where(items.c.viaje_id.is_not(None))
        ).fetchall()
    }

    viaje_items = conn.execute(
        sa.select(
            items.c.id,
            items.c.conciliacion_id,
            items.c.fecha_servicio,
            items.c.placa,
            items.c.origen,
            items.c.destino,
            items.c.tarifa_tercero,
            items.c.tarifa_cliente,
        ).where(
            items.c.tipo == "VIAJE",
            items.c.viaje_id.is_(None),
        )
    ).fetchall()

    for it in viaje_items:
        item_id = it[0]
        conc_id = it[1]
        fecha = it[2]
        placa = it[3]

        candidates = conn.execute(
            sa.select(viajes.c.id)
            .where(
                viajes.c.conciliacion_id == conc_id,
                viajes.c.fecha_servicio == fecha,
                viajes.c.placa == placa,
            )
            .order_by(viajes.c.id.asc())
        ).fetchall()

        selected_viaje_id = None
        for cand in candidates:
            if cand[0] not in used_viaje_ids:
                selected_viaje_id = cand[0]
                break

        if selected_viaje_id is not None:
            conn.execute(
                sa.update(items)
                .where(items.c.id == item_id)
                .values(viaje_id=selected_viaje_id)
            )
            used_viaje_ids.add(selected_viaje_id)

    # 3) Crear item faltante si existe viaje vinculado a conciliacion pero sin item
    linked_viajes = conn.execute(
        sa.select(
            viajes.c.id,
            viajes.c.conciliacion_id,
            viajes.c.fecha_servicio,
            viajes.c.origen,
            viajes.c.destino,
            viajes.c.placa,
            viajes.c.conductor,
            viajes.c.tarifa_tercero,
            viajes.c.tarifa_cliente,
            viajes.c.rentabilidad,
            viajes.c.manifiesto_numero,
            viajes.c.descripcion,
            viajes.c.cargado_por,
            viajes.c.created_by,
        ).where(viajes.c.conciliacion_id.is_not(None))
    ).fetchall()

    for v in linked_viajes:
        viaje_id = v[0]
        exists = conn.execute(
            sa.select(items.c.id).where(items.c.viaje_id == viaje_id)
        ).first()
        if exists:
            continue

        conn.execute(
            sa.insert(items).values(
                conciliacion_id=v[1],
                viaje_id=v[0],
                tipo="VIAJE",
                estado="PENDIENTE",
                fecha_servicio=v[2],
                origen=v[3],
                destino=v[4],
                placa=v[5],
                conductor=v[6],
                tarifa_tercero=v[7],
                tarifa_cliente=v[8],
                rentabilidad=v[9],
                manifiesto_numero=v[10],
                remesa=None,
                descripcion=v[11],
                cargado_por=v[12],
                created_by=v[13],
                created_at=datetime.utcnow(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("conciliacion_items") as batch_op:
        batch_op.drop_index("ix_conciliacion_items_viaje_id")
        batch_op.drop_constraint("fk_conciliacion_items_viaje_id", type_="foreignkey")
        batch_op.drop_column("viaje_id")
