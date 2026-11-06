"""report approximate area

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-06 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0008'
down_revision: Union[str, Sequence[str], None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('lost_reports', sa.Column('area_lat', sa.Numeric(precision=6, scale=3), nullable=True))
    op.add_column('lost_reports', sa.Column('area_lng', sa.Numeric(precision=6, scale=3), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('lost_reports', 'area_lng')
    op.drop_column('lost_reports', 'area_lat')
