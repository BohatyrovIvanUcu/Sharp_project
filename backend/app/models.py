import json
import uuid
from datetime import UTC, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.config import settings
from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


def default_uuid() -> str:
    return str(uuid.uuid4())


def default_cognitive_profile() -> dict[str, Any]:
    return {
        "blocker_counts": {},
        "effective_frameworks": {},
        "completed_steps": 0,
        "completed_sessions": 0,
        "total_focus_seconds": 0,
        "current_streak": 0,
        "subscription": {
            "tier": "free",
            "audio_coach_enabled": False,
            "video_explainer_enabled": False,
        },
    }


JSONBVariant = JSON().with_variant(JSONB(), "postgresql")


class EmbeddingVector(TypeDecorator[list[float]]):
    """Stores 1024-d vectors in pgvector on PostgreSQL and JSON text on SQLite for fast unit tests."""

    impl = Text
    cache_ok = True
    comparator_factory = Vector.comparator_factory

    def __init__(self, dimensions: int = settings.bedrock_embedding_dim) -> None:
        super().__init__()
        self.dimensions = dimensions

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(self.dimensions))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: list[float] | None, dialect: Any) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return json.dumps(value)

    def process_result_value(self, value: Any, dialect: Any) -> list[float] | None:
        if value is None:
            return None
        if isinstance(value, str):
            return [float(x) for x in json.loads(value)]
        return [float(x) for x in value]


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    cognito_sub: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cognitive_profile: Mapped[dict[str, Any]] = mapped_column(
        JSONBVariant,
        default=default_cognitive_profile,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    sessions: Mapped[list["ThinkingSession"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    memories: Mapped[list["MemoryEmbedding"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    billing_invoices: Mapped[list["BillingInvoice"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class ThinkingSession(Base):
    __tablename__ = "thinking_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    raw_problem: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(8), default="uk", nullable=False)
    framework_id: Mapped[str] = mapped_column(String(64), default="socratic", nullable=False)
    phase: Mapped[str] = mapped_column(String(32), default="socratic", nullable=False)
    detected_blocker: Mapped[str | None] = mapped_column(String(64), nullable=True)
    memory_insight: Mapped[list[dict[str, Any]]] = mapped_column(JSONBVariant, default=list, nullable=False)
    attachments_json: Mapped[list[dict[str, Any]]] = mapped_column(JSONBVariant, default=list, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_questions: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")
    turns: Mapped[list["SessionTurn"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionTurn.turn_number",
    )
    steps: Mapped[list["ActionStep"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ActionStep.order_index",
    )
    messages: Mapped[list["SessionMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionMessage.created_at",
    )
    memories: Mapped[list["MemoryEmbedding"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )


class SessionMessage(Base):
    __tablename__ = "session_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("thinking_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    ai_source: Mapped[str] = mapped_column(String(32), default="bedrock", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped[ThinkingSession] = relationship(back_populates="messages")


class SessionTurn(Base):
    __tablename__ = "session_turns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("thinking_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False)
    framework_id: Mapped[str] = mapped_column(String(64), nullable=False)
    framework_reason: Mapped[str] = mapped_column(Text, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options_json: Mapped[list[dict[str, str]]] = mapped_column(JSONBVariant, default=list, nullable=False)
    user_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_option_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    guardrail_triggered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_source: Mapped[str] = mapped_column(String(32), default="bedrock", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped[ThinkingSession] = relationship(back_populates="turns")


class ActionStep(Base):
    __tablename__ = "action_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("thinking_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    parent_step_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    timer_mode: Mapped[str] = mapped_column(String(24), default="sprint", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="locked", nullable=False)
    pomodoro_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reflection_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped[ThinkingSession] = relationship(back_populates="steps")


class MemoryEmbedding(Base):
    __tablename__ = "memory_embeddings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    session_id: Mapped[str | None] = mapped_column(
        ForeignKey("thinking_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    blocker_type: Mapped[str] = mapped_column(String(64), nullable=False)
    framework_id: Mapped[str] = mapped_column(String(64), nullable=False)
    first_step_title: Mapped[str | None] = mapped_column(String(240), nullable=True)
    embedding: Mapped[list[float]] = mapped_column(
        EmbeddingVector(settings.bedrock_embedding_dim),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="memories")
    session: Mapped["ThinkingSession | None"] = relationship(back_populates="memories")


class BillingInvoice(Base):
    __tablename__ = "billing_invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(32), default="monobank", nullable=False)
    invoice_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    reference: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[int] = mapped_column(Integer, default=980, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="created", nullable=False)
    page_url: Mapped[str] = mapped_column(Text, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="billing_invoices")
