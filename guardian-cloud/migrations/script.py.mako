"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "${up_revision}"
down_revision: Union[str, None] = "${down_revision}"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from guardian_cloud.persistence.models import Base
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    from guardian_cloud.persistence.models import Base
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
