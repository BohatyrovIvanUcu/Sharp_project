"""add billing_invoices table for monobank acquiring

Revision ID: 0004_billing_invoices
Revises: 0003_session_messages
Create Date: 2026-11-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_billing_invoices"
down_revision: str | Sequence[str] | None = "0003_session_messages"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "billing_invoices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("invoice_id", sa.String(length=128), nullable=False),
        sa.Column("reference", sa.String(length=128), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("page_url", sa.Text(), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_billing_invoices_user_id", "billing_invoices", ["user_id"])
    op.create_index("ix_billing_invoices_invoice_id", "billing_invoices", ["invoice_id"], unique=True)
    op.create_index("ix_billing_invoices_reference", "billing_invoices", ["reference"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_billing_invoices_reference", table_name="billing_invoices")
    op.drop_index("ix_billing_invoices_invoice_id", table_name="billing_invoices")
    op.drop_index("ix_billing_invoices_user_id", table_name="billing_invoices")
    op.drop_table("billing_invoices")
