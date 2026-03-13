"""add titulo and conciliacion_id to viajes

Revision ID: d19102f9ed50
Revises: 
Create Date: 2026-03-13 16:02:02.788873

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd19102f9ed50'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: extend 'viajes' with titulo, conciliacion_id and make conductor nullable."""
    with op.batch_alter_table("viajes") as batch_op:
        # Add conciliacion_id (nullable for existing rows)
        batch_op.add_column(sa.Column("conciliacion_id", sa.Integer(), nullable=True))

        # Add titulo as nullable first
        batch_op.add_column(sa.Column("titulo", sa.String(length=255), nullable=True))

        # Make conductor nullable
        batch_op.alter_column("conductor", existing_type=sa.String(length=255), nullable=True)

    # For existing rows, set a default titulo based on id to satisfy NOT NULL
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE viajes SET titulo = COALESCE(titulo, 'Viaje ' || id)"))

    # Enforce NOT NULL on titulo using batch mode
    with op.batch_alter_table("viajes") as batch_op:
        batch_op.alter_column("titulo", existing_type=sa.String(length=255), nullable=False)


def downgrade() -> None:
    """Downgrade schema: revert viajes changes."""
    with op.batch_alter_table("viajes") as batch_op:
        # Revert conductor to NOT NULL
        batch_op.alter_column("conductor", existing_type=sa.String(length=255), nullable=False)

        # Drop titulo and conciliacion_id
        batch_op.drop_column("titulo")
        batch_op.drop_column("conciliacion_id")
