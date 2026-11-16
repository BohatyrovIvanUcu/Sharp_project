from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import User
from app.rate_limit import limit_llm_calls
from app.schemas import (
    AnswerTurnIn,
    ChatMessageIn,
    CompleteStepIn,
    CreateSessionIn,
    SessionSummaryOut,
    SwitchFrameworkIn,
    ThinkingSessionOut,
)
from app.services import sessions as sessions_service

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionSummaryOut])
def list_sessions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SessionSummaryOut]:
    return sessions_service.list_sessions(db, user)


@router.post("", response_model=ThinkingSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: CreateSessionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(limit_llm_calls),
) -> ThinkingSessionOut:
    return sessions_service.create_session(db, user, payload)


@router.get("/{session_id}", response_model=ThinkingSessionOut)
def get_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ThinkingSessionOut:
    return sessions_service.get_session(db, user, session_id)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    sessions_service.delete_session(db, user, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{session_id}/answer", response_model=ThinkingSessionOut)
def answer_turn(
    session_id: str,
    payload: AnswerTurnIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(limit_llm_calls),
) -> ThinkingSessionOut:
    return sessions_service.answer_turn(db, user, session_id, payload)


@router.post("/{session_id}/framework", response_model=ThinkingSessionOut)
def switch_framework(
    session_id: str,
    payload: SwitchFrameworkIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ThinkingSessionOut:
    return sessions_service.switch_framework(db, user, session_id, payload.framework_id)


@router.post("/{session_id}/plan", response_model=ThinkingSessionOut)
def generate_plan(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(limit_llm_calls),
) -> ThinkingSessionOut:
    return sessions_service.force_generate_plan(db, user, session_id)


@router.post("/{session_id}/chat", response_model=ThinkingSessionOut)
def send_chat_message(
    session_id: str,
    payload: ChatMessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(limit_llm_calls),
) -> ThinkingSessionOut:
    return sessions_service.send_chat_message(db, user, session_id, payload)


@router.post("/{session_id}/steps/{step_id}/complete", response_model=ThinkingSessionOut)
def complete_step(
    session_id: str,
    step_id: str,
    payload: CompleteStepIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ThinkingSessionOut:
    return sessions_service.complete_step(db, user, session_id, step_id, payload)


@router.post("/{session_id}/steps/{step_id}/stuck", response_model=ThinkingSessionOut)
def mark_step_stuck(
    session_id: str,
    step_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(limit_llm_calls),
) -> ThinkingSessionOut:
    return sessions_service.mark_step_stuck(db, user, session_id, step_id)
