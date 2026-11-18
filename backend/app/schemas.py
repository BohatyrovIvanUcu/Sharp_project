import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]")

BlockerType = Literal["overwhelm", "unclear_scope", "perfectionism", "missing_knowledge", "fatigue"]
FrameworkId = Literal["socratic", "five_whys", "first_principles", "inversion", "two_min_rule", "feynman"]
SessionPhase = Literal["socratic", "chat", "planning", "executing", "completed"]
SessionMode = Literal["task", "chat"]
StepStatus = Literal["locked", "active", "completed", "split"]
TimerMode = Literal["micro", "sprint", "pomodoro"]


class LocalizedText(BaseModel):
    uk: str
    en: str


class FrameworkItem(BaseModel):
    id: FrameworkId
    name: LocalizedText
    tagline: LocalizedText
    when_to_use: LocalizedText
    cognitive_mechanism: LocalizedText
    anti_pattern: LocalizedText
    example_question: LocalizedText
    recommended_timer: TimerMode
    color_token: str


class QuestionOption(BaseModel):
    id: str
    label: str
    hint: str


class MemoryMatch(BaseModel):
    id: str
    summary_text: str
    blocker_type: str
    framework_id: str
    first_step_title: str | None = None
    similarity: float
    created_at: datetime


class SessionTurnOut(BaseModel):
    id: str
    turn_number: int
    framework_id: str
    framework_reason: str
    question_text: str
    options: list[QuestionOption]
    user_answer: str | None = None
    selected_option_id: str | None = None
    guardrail_triggered: bool = False
    ai_source: str
    created_at: datetime


class ActionStepOut(BaseModel):
    id: str
    parent_step_id: str | None = None
    order_index: int
    title: str
    description: str
    duration_minutes: int
    timer_mode: str
    status: str
    pomodoro_seconds: int
    reflection_note: str | None = None
    completed_at: datetime | None = None


class SessionMessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    ai_source: str
    conversation_complete: bool = False
    created_at: datetime


class SessionAttachmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    mime_type: str = Field(default="text/plain", max_length=120)
    size_bytes: int = Field(default=0, ge=0, le=3_000_000)
    text_excerpt: str | None = Field(default=None, max_length=12000)

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, value: str) -> str:
        cleaned = _CONTROL_CHARS_RE.sub("", value).replace("\r", " ").replace("\n", " ")
        cleaned = " ".join(cleaned.split())
        if not cleaned:
            raise ValueError("Attachment name cannot be empty.")
        return cleaned[:160]

    @field_validator("text_excerpt")
    @classmethod
    def sanitize_excerpt(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _CONTROL_CHARS_RE.sub("", value)


class SessionAttachmentOut(BaseModel):
    name: str
    mime_type: str
    size_bytes: int
    has_text: bool = False


class ThinkingSessionOut(BaseModel):
    id: str
    title: str
    raw_problem: str
    language: str
    framework_id: str
    phase: str
    detected_blocker: str | None = None
    memory_insight: list[MemoryMatch]
    attachments: list[SessionAttachmentOut] = Field(default_factory=list)
    question_count: int
    max_questions: int
    summary: str | None = None
    turns: list[SessionTurnOut]
    steps: list[ActionStepOut]
    messages: list[SessionMessageOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class SessionSummaryOut(BaseModel):
    id: str
    title: str
    raw_problem: str
    language: str
    framework_id: str
    phase: str
    detected_blocker: str | None = None
    attachments: list[SessionAttachmentOut] = Field(default_factory=list)
    question_count: int
    max_questions: int
    active_step: ActionStepOut | None = None
    created_at: datetime
    updated_at: datetime


class CreateSessionIn(BaseModel):
    problem: str = Field(default="", max_length=2000)
    framework_id: FrameworkId | None = None
    language: Literal["uk", "en"] | None = None
    mode: SessionMode = "task"
    attachments: list[SessionAttachmentIn] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def require_problem_or_attachment(self) -> "CreateSessionIn":
        if len(self.problem.strip()) < 3 and not self.attachments:
            raise ValueError("Provide a problem description (at least 3 chars) or attach a file.")
        return self


class ChatMessageIn(BaseModel):
    content: str = Field(default="", max_length=2000)
    attachments: list[SessionAttachmentIn] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def require_content_or_attachment(self) -> "ChatMessageIn":
        if not self.content.strip() and not self.attachments:
            raise ValueError("Provide a message or attach a file.")
        return self


class AnswerTurnIn(BaseModel):
    answer_text: str = Field(min_length=1, max_length=1200)
    option_id: str | None = Field(default=None, max_length=64)
    turn_number: int | None = Field(default=None, ge=1)


class SwitchFrameworkIn(BaseModel):
    framework_id: FrameworkId


class CompleteStepIn(BaseModel):
    elapsed_seconds: int = Field(default=0, ge=0, le=14400)
    reflection_note: str | None = Field(default=None, max_length=500)


SubscriptionTier = Literal["free", "pro"]


class SubscriptionStatusOut(BaseModel):
    tier: SubscriptionTier = "free"
    audio_coach_enabled: bool = False
    video_explainer_enabled: bool = False


class UpdateSubscriptionIn(BaseModel):
    tier: SubscriptionTier


class MonobankCheckoutOut(BaseModel):
    invoice_id: str
    reference: str
    page_url: str
    amount: int
    currency: int
    status: str = "created"


class MonobankConfirmIn(BaseModel):
    reference: str | None = Field(default=None, max_length=128)
    invoice_id: str | None = Field(default=None, max_length=128)


class MonobankConfirmOut(BaseModel):
    invoice_id: str
    reference: str
    status: str
    amount: int
    currency: int
    upgraded: bool
    failure_reason: str | None = None
    user: "UserProfileOut"


class BillingInvoiceSummaryOut(BaseModel):
    invoice_id: str
    reference: str
    status: str
    amount: int
    currency: int
    page_url: str
    failure_reason: str | None = None
    created_at: datetime
    paid_at: datetime | None = None


class InternalBillingRecordIn(BaseModel):
    invoice_id: str = Field(min_length=1, max_length=128)
    reference: str = Field(min_length=1, max_length=128)
    amount: int = Field(gt=0)
    currency: int = Field(default=980, gt=0)
    status: str = Field(default="created", max_length=32)
    page_url: str = Field(min_length=1, max_length=1024)


class InternalBillingSyncIn(BaseModel):
    invoice_id: str = Field(min_length=1, max_length=128)
    status: str = Field(min_length=1, max_length=32)
    amount: int | None = None
    ccy: int | None = None
    reference: str | None = Field(default=None, max_length=128)
    failure_reason: str | None = Field(default=None, max_length=500)


class UserProfileOut(BaseModel):
    id: str
    email: str
    name: str | None = None
    cognitive_profile: dict[str, Any]
    subscription: SubscriptionStatusOut = Field(default_factory=SubscriptionStatusOut)
    auth_enabled: bool
    created_at: datetime


class UpdateUserIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)


class MemoryOverviewOut(BaseModel):
    cognitive_profile: dict[str, Any]
    memories: list[MemoryMatch]
