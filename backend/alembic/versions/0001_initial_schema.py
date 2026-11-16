"""initial schema with pgvector memory

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("cognito_sub", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("cognitive_profile", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_cognito_sub", "users", ["cognito_sub"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "thinking_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("raw_problem", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=8), nullable=False),
        sa.Column("framework_id", sa.String(length=64), nullable=False),
        sa.Column("phase", sa.String(length=32), nullable=False),
        sa.Column("detected_blocker", sa.String(length=64), nullable=True),
        sa.Column("memory_insight", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("question_count", sa.Integer(), nullable=False),
        sa.Column("max_questions", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_thinking_sessions_user_id", "thinking_sessions", ["user_id"])

    op.create_table(
        "session_turns",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("turn_number", sa.Integer(), nullable=False),
        sa.Column("framework_id", sa.String(length=64), nullable=False),
        sa.Column("framework_reason", sa.Text(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("options_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("user_answer", sa.Text(), nullable=True),
        sa.Column("selected_option_id", sa.String(length=64), nullable=True),
        sa.Column("guardrail_triggered", sa.Boolean(), nullable=False),
        sa.Column("ai_source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["thinking_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_turns_session_id", "session_turns", ["session_id"])

    op.create_table(
        "action_steps",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("parent_step_id", sa.String(length=36), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("timer_mode", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("pomodoro_seconds", sa.Integer(), nullable=False),
        sa.Column("reflection_note", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["thinking_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_action_steps_session_id", "action_steps", ["session_id"])

    op.create_table(
        "memory_embeddings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=True),
        sa.Column("summary_text", sa.Text(), nullable=False),
        sa.Column("blocker_type", sa.String(length=64), nullable=False),
        sa.Column("framework_id", sa.String(length=64), nullable=False),
        sa.Column("first_step_title", sa.String(length=240), nullable=True),
        sa.Column("embedding", Vector(1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["thinking_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_embeddings_user_id", "memory_embeddings", ["user_id"])
    op.create_index("ix_memory_embeddings_session_id", "memory_embeddings", ["session_id"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_memory_embeddings_vector "
        "ON memory_embeddings USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_index("ix_memory_embeddings_vector", table_name="memory_embeddings")
    op.drop_index("ix_memory_embeddings_session_id", table_name="memory_embeddings")
    op.drop_index("ix_memory_embeddings_user_id", table_name="memory_embeddings")
    op.drop_table("memory_embeddings")
    op.drop_index("ix_action_steps_session_id", table_name="action_steps")
    op.drop_table("action_steps")
    op.drop_index("ix_session_turns_session_id", table_name="session_turns")
    op.drop_table("session_turns")
    op.drop_index("ix_thinking_sessions_user_id", table_name="thinking_sessions")
    op.drop_table("thinking_sessions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_cognito_sub", table_name="users")
    op.drop_table("users")
