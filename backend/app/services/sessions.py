"""Business logic for Socratic sessions, step execution locks, and memory updates."""

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.ai import bedrock_service, memory_service
from app.ai.prompts import detect_language
from app.models import (
    ActionStep,
    MemoryEmbedding,
    SessionMessage,
    SessionTurn,
    ThinkingSession,
    User,
    utcnow,
)
from app.schemas import (
    ActionStepOut,
    AnswerTurnIn,
    ChatMessageIn,
    CompleteStepIn,
    CreateSessionIn,
    MemoryMatch,
    QuestionOption,
    SessionAttachmentIn,
    SessionAttachmentOut,
    SessionMessageOut,
    SessionSummaryOut,
    SessionTurnOut,
    ThinkingSessionOut,
)

MAX_MESSAGES_PER_SESSION = 100
MAX_STEPS_PER_SESSION = 15


def _derive_title(problem: str) -> str:
    first_line = " ".join(problem.strip().splitlines()[:1]).strip()
    if len(first_line) <= 72:
        return first_line
    return first_line[:69].rstrip() + "..."


def _build_history(turns: list[SessionTurn]) -> list[dict[str, str]]:
    history: list[dict[str, str]] = []
    for turn in sorted(turns, key=lambda t: t.turn_number):
        if turn.user_answer:
            history.append({"question": turn.question_text, "answer": turn.user_answer})
    return history


def _sort_messages(messages: list[SessionMessage]) -> list[SessionMessage]:
    return sorted(
        messages,
        key=lambda m: (
            m.created_at.replace(tzinfo=None) if m.created_at.tzinfo else m.created_at,
            0 if m.role == "user" else 1,
        ),
    )


def _build_chat_messages(messages: list[SessionMessage]) -> list[dict[str, str]]:
    return [{"role": msg.role, "content": msg.content} for msg in _sort_messages(messages)]


def _serialize_session_turns_for_chat(turns: list[SessionTurn]) -> list[dict[str, str]]:
    return [
        {"question": turn.question_text, "answer": turn.user_answer or ""}
        for turn in sorted(turns, key=lambda t: t.turn_number)
    ]


def _serialize_steps_for_chat(steps: list[ActionStep]) -> list[dict[str, Any]]:
    return [
        {
            "order_index": step.order_index,
            "status": step.status,
            "title": step.title,
            "description": step.description,
            "duration_minutes": step.duration_minutes,
        }
        for step in sorted(steps, key=lambda s: s.order_index)
    ]


def _get_user_session(db: Session, user: User, session_id: str) -> ThinkingSession:
    stmt = (
        select(ThinkingSession)
        .options(
            selectinload(ThinkingSession.turns),
            selectinload(ThinkingSession.steps),
            selectinload(ThinkingSession.messages),
        )
        .where(ThinkingSession.id == session_id, ThinkingSession.user_id == user.id)
        .execution_options(populate_existing=True)
    )
    session = db.scalar(stmt)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session


def _turn_out(turn: SessionTurn) -> SessionTurnOut:
    return SessionTurnOut(
        id=turn.id,
        turn_number=turn.turn_number,
        framework_id=turn.framework_id,
        framework_reason=turn.framework_reason,
        question_text=turn.question_text,
        options=[QuestionOption(**opt) for opt in (turn.options_json or [])],
        user_answer=turn.user_answer,
        selected_option_id=turn.selected_option_id,
        guardrail_triggered=turn.guardrail_triggered,
        ai_source=turn.ai_source,
        created_at=turn.created_at,
    )


def _step_out(step: ActionStep) -> ActionStepOut:
    return ActionStepOut(
        id=step.id,
        parent_step_id=step.parent_step_id,
        order_index=step.order_index,
        title=step.title,
        description=step.description,
        duration_minutes=step.duration_minutes,
        timer_mode=step.timer_mode,
        status=step.status,
        pomodoro_seconds=step.pomodoro_seconds,
        reflection_note=step.reflection_note,
        completed_at=step.completed_at,
    )


def _encode_chat_ai_source(ai_source: str, conversation_complete: bool) -> str:
    if conversation_complete and not ai_source.endswith(":complete"):
        return f"{ai_source}:complete"[:32]
    return ai_source[:32]


def _message_out(message: SessionMessage) -> SessionMessageOut:
    role = "assistant" if message.role == "assistant" else "user"
    raw_source = message.ai_source or "bedrock"
    is_complete = raw_source.endswith(":complete") or raw_source == "crisis_support"
    clean_source = raw_source.removesuffix(":complete")
    return SessionMessageOut(
        id=message.id,
        role=role,
        content=message.content,
        ai_source=clean_source,
        conversation_complete=is_complete,
        created_at=message.created_at,
    )


def _serialize_attachments(items: list[SessionAttachmentIn]) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for item in items[:5]:
        excerpt = item.text_excerpt.strip()[:6000] if item.text_excerpt else ""
        serialized.append(
            {
                "name": item.name.strip()[:160],
                "mime_type": item.mime_type.strip()[:120] or "application/octet-stream",
                "size_bytes": item.size_bytes,
                "text_excerpt": excerpt or None,
            }
        )
    return serialized


def _attachments_out(raw_list: list[dict[str, Any]] | None) -> list[SessionAttachmentOut]:
    attachments: list[SessionAttachmentOut] = []
    for raw in raw_list or []:
        try:
            attachments.append(
                SessionAttachmentOut(
                    name=str(raw.get("name") or "file"),
                    mime_type=str(raw.get("mime_type") or "application/octet-stream"),
                    size_bytes=int(raw.get("size_bytes") or 0),
                    has_text=bool(raw.get("text_excerpt")),
                )
            )
        except Exception:
            continue
    return attachments


def to_session_out(session: ThinkingSession) -> ThinkingSessionOut:
    memories: list[MemoryMatch] = []
    for raw in session.memory_insight or []:
        try:
            memories.append(MemoryMatch(**raw))
        except Exception:
            continue

    turns = sorted(session.turns, key=lambda t: t.turn_number)
    steps = sorted(session.steps, key=lambda s: s.order_index)
    messages = _sort_messages(session.messages)[-MAX_MESSAGES_PER_SESSION:]
    return ThinkingSessionOut(
        id=session.id,
        title=session.title,
        raw_problem=session.raw_problem,
        language=session.language,
        framework_id=session.framework_id,
        phase=session.phase,
        detected_blocker=session.detected_blocker,
        memory_insight=memories,
        attachments=_attachments_out(session.attachments_json),
        question_count=session.question_count,
        max_questions=session.max_questions,
        summary=session.summary,
        turns=[_turn_out(t) for t in turns],
        steps=[_step_out(s) for s in steps],
        messages=[_message_out(m) for m in messages],
        created_at=session.created_at,
        updated_at=session.updated_at,
        completed_at=session.completed_at,
    )


def to_session_summary(session: ThinkingSession) -> SessionSummaryOut:
    steps = sorted(session.steps, key=lambda s: s.order_index)
    active = next((s for s in steps if s.status == "active"), None)
    return SessionSummaryOut(
        id=session.id,
        title=session.title,
        raw_problem=session.raw_problem,
        language=session.language,
        framework_id=session.framework_id,
        phase=session.phase,
        detected_blocker=session.detected_blocker,
        attachments=_attachments_out(session.attachments_json),
        question_count=session.question_count,
        max_questions=session.max_questions,
        active_step=_step_out(active) if active else None,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def list_sessions(db: Session, user: User) -> list[SessionSummaryOut]:
    stmt = (
        select(ThinkingSession)
        .options(selectinload(ThinkingSession.steps))
        .where(ThinkingSession.user_id == user.id)
        .order_by(ThinkingSession.updated_at.desc())
        .limit(30)
    )
    sessions = db.scalars(stmt).all()
    return [to_session_summary(s) for s in sessions]


def get_session(db: Session, user: User, session_id: str) -> ThinkingSessionOut:
    return to_session_out(_get_user_session(db, user, session_id))


def create_session(db: Session, user: User, payload: CreateSessionIn) -> ThinkingSessionOut:
    attachments = _serialize_attachments(payload.attachments)
    raw_problem = payload.problem.strip()
    if len(raw_problem) < 3 and attachments:
        prefix = "File" if payload.language == "en" else "Файл"
        raw_problem = f"{prefix}: {', '.join(a['name'] for a in attachments)}"[:2000]

    detection_source = (
        raw_problem + " " + " ".join(str(a.get("text_excerpt") or "")[:400] for a in attachments)
    )
    language = detect_language(detection_source, payload.language)
    memories = memory_service.search_similar_memories(db, user.id, detection_source, limit=3)

    initial_fw = payload.framework_id or "socratic"
    serialized_memories: list[dict[str, Any]] = [m.model_dump(mode="json") for m in memories]

    if payload.mode == "chat":
        reply_res = bedrock_service.generate_chat_reply(
            problem=raw_problem,
            phase="chat",
            framework_id=initial_fw,
            language=language,
            messages=[{"role": "user", "content": raw_problem}],
            turns=[],
            steps=[],
            memories=memories,
            cognitive_profile=user.cognitive_profile,
            attachments=attachments,
        )
        session = ThinkingSession(
            user_id=user.id,
            title=_derive_title(raw_problem),
            raw_problem=raw_problem,
            language=language,
            framework_id=initial_fw,
            phase="chat",
            detected_blocker=None,
            memory_insight=serialized_memories,
            attachments_json=attachments,
            question_count=0,
            max_questions=3,
        )
        db.add(session)
        db.flush()

        base_ts = utcnow()
        db.add(
            SessionMessage(
                session_id=session.id,
                role="user",
                content=raw_problem,
                ai_source="user",
                created_at=base_ts,
            )
        )
        db.add(
            SessionMessage(
                session_id=session.id,
                role="assistant",
                content=reply_res.reply,
                ai_source=_encode_chat_ai_source(
                    reply_res.ai_source,
                    reply_res.conversation_complete,
                ),
                created_at=utcnow(),
            )
        )
        db.commit()
        return to_session_out(_get_user_session(db, user, session.id))

    turn_res = bedrock_service.generate_socratic_turn(
        problem=raw_problem,
        history=[],
        framework_id=initial_fw,
        language=language,
        turn_number=1,
        memories=memories,
        cognitive_profile=user.cognitive_profile,
        attachments=attachments,
        chat_messages=[],
    )

    chosen_framework = payload.framework_id or turn_res.recommended_framework
    is_fast_track = bool(turn_res.is_simple_problem and not turn_res.guardrail_triggered)

    session = ThinkingSession(
        user_id=user.id,
        title=_derive_title(raw_problem),
        raw_problem=raw_problem,
        language=language,
        framework_id=chosen_framework,
        phase="socratic",
        detected_blocker=turn_res.detected_blocker,
        memory_insight=serialized_memories,
        attachments_json=attachments,
        question_count=1,
        max_questions=1 if is_fast_track else 3,
    )
    db.add(session)
    db.flush()

    turn = SessionTurn(
        session_id=session.id,
        turn_number=1,
        framework_id=chosen_framework,
        framework_reason=turn_res.framework_reason,
        question_text=turn_res.question,
        options_json=[opt.model_dump() for opt in turn_res.options],
        user_answer=turn_res.direct_response or raw_problem if is_fast_track else None,
        guardrail_triggered=turn_res.guardrail_triggered,
        ai_source=turn_res.ai_source,
    )
    db.add(turn)
    db.flush()

    if is_fast_track:
        session.turns.append(turn)
        _build_and_save_plan(
            db,
            user,
            session,
            direct_response=turn_res.direct_response or turn_res.question,
        )

    db.commit()
    db.expire_all()
    return to_session_out(_get_user_session(db, user, session.id))


def _clear_session_steps(db: Session, session: ThinkingSession) -> None:
    had_steps = bool(session.steps)
    for old_step in list(session.steps):
        session.steps.remove(old_step)
        db.delete(old_step)
    if had_steps:
        db.flush()


def _build_and_save_plan(
    db: Session,
    user: User,
    session: ThinkingSession,
    *,
    direct_response: str | None = None,
) -> None:
    memories = [MemoryMatch(**m) for m in (session.memory_insight or [])]
    history = _build_history(session.turns)
    chat_messages = _build_chat_messages(session.messages)
    plan_res = bedrock_service.generate_action_plan(
        problem=session.raw_problem,
        history=history,
        framework_id=session.framework_id,
        language=session.language,
        memories=memories,
        cognitive_profile=user.cognitive_profile,
        attachments=session.attachments_json,
        chat_messages=chat_messages,
        direct_response=direct_response,
    )

    _clear_session_steps(db, session)

    for idx, step_draft in enumerate(plan_res.steps):
        db.add(
            ActionStep(
                session_id=session.id,
                order_index=idx + 1,
                title=step_draft.title,
                description=step_draft.description,
                duration_minutes=step_draft.duration_minutes,
                timer_mode=step_draft.timer_mode,
                status="active" if idx == 0 else "locked",
            )
        )

    session.phase = "executing"
    session.summary = plan_res.summary
    session.detected_blocker = plan_res.detected_blocker
    session.updated_at = utcnow()


def answer_turn(db: Session, user: User, session_id: str, payload: AnswerTurnIn) -> ThinkingSessionOut:
    session = _get_user_session(db, user, session_id)
    answer_text = payload.answer_text.strip()
    if not answer_text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Answer text cannot be empty")

    if payload.turn_number is None:
        if session.phase != "socratic":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session is no longer in the Socratic phase")
    else:
        if session.phase == "completed" or any(s.status == "completed" for s in session.steps):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cannot change answers after completing action steps",
            )
        if session.phase not in ("socratic", "executing"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Session is not in a phase where answers can be updated",
            )

    turns = sorted(session.turns, key=lambda t: t.turn_number)
    if payload.turn_number is not None:
        target_turn = next((t for t in turns if t.turn_number == payload.turn_number), None)
        if target_turn is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Question turn not found")
        if any(t.turn_number < target_turn.turn_number and t.user_answer is None for t in turns):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Previous question must be answered first")
    else:
        target_turn = next((t for t in reversed(turns) if t.user_answer is None), None)
        if target_turn is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No pending question to answer")

    has_progressed_past = any(t.turn_number > target_turn.turn_number for t in turns) or (
        session.phase == "executing"
    )
    if (
        has_progressed_past
        and target_turn.user_answer == answer_text
        and target_turn.selected_option_id == payload.option_id
    ):
        return to_session_out(session)

    target_turn.user_answer = answer_text
    target_turn.selected_option_id = payload.option_id
    session.updated_at = utcnow()

    stale_turns = [t for t in turns if t.turn_number > target_turn.turn_number]
    for stale_turn in stale_turns:
        session.turns.remove(stale_turn)
        db.delete(stale_turn)
    if stale_turns:
        db.flush()

    if target_turn.turn_number >= session.max_questions:
        session.question_count = target_turn.turn_number
        _build_and_save_plan(db, user, session)
        db.commit()
        db.expire_all()
        return to_session_out(_get_user_session(db, user, session.id))

    _clear_session_steps(db, session)
    session.summary = None
    session.phase = "socratic"

    memories = [MemoryMatch(**m) for m in (session.memory_insight or [])]
    next_turn_number = target_turn.turn_number + 1
    kept_turns = [t for t in turns if t.turn_number <= target_turn.turn_number]
    history = _build_history(kept_turns)
    chat_messages = _build_chat_messages(session.messages)

    turn_res = bedrock_service.generate_socratic_turn(
        problem=session.raw_problem,
        history=history,
        framework_id=session.framework_id,
        language=session.language,
        turn_number=next_turn_number,
        memories=memories,
        cognitive_profile=user.cognitive_profile,
        attachments=session.attachments_json,
        chat_messages=chat_messages,
    )

    if turn_res.is_simple_problem and not turn_res.guardrail_triggered:
        session.question_count = target_turn.turn_number
        _build_and_save_plan(
            db,
            user,
            session,
            direct_response=turn_res.direct_response or turn_res.question,
        )
        db.commit()
        db.expire_all()
        return to_session_out(_get_user_session(db, user, session.id))

    session.question_count = next_turn_number
    session.detected_blocker = turn_res.detected_blocker
    db.add(
        SessionTurn(
            session_id=session.id,
            turn_number=next_turn_number,
            framework_id=session.framework_id,
            framework_reason=turn_res.framework_reason,
            question_text=turn_res.question,
            options_json=[opt.model_dump() for opt in turn_res.options],
            guardrail_triggered=turn_res.guardrail_triggered,
            ai_source=turn_res.ai_source,
        )
    )
    db.commit()
    db.expire_all()
    return to_session_out(_get_user_session(db, user, session.id))


def switch_framework(
    db: Session,
    user: User,
    session_id: str,
    framework_id: str,
) -> ThinkingSessionOut:
    session = _get_user_session(db, user, session_id)
    if session.phase != "socratic":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Framework can only be switched during questioning")

    session.framework_id = framework_id
    turns = sorted(session.turns, key=lambda t: t.turn_number)
    pending_turn = next((t for t in reversed(turns) if t.user_answer is None), None)
    if pending_turn is not None:
        memories = [MemoryMatch(**m) for m in (session.memory_insight or [])]
        history = _build_history([t for t in turns if t.id != pending_turn.id])
        chat_messages = _build_chat_messages(session.messages)
        turn_res = bedrock_service.generate_socratic_turn(
            problem=session.raw_problem,
            history=history,
            framework_id=framework_id,
            language=session.language,
            turn_number=pending_turn.turn_number,
            memories=memories,
            cognitive_profile=user.cognitive_profile,
            attachments=session.attachments_json,
            chat_messages=chat_messages,
        )
        pending_turn.framework_id = framework_id
        pending_turn.framework_reason = turn_res.framework_reason
        pending_turn.question_text = turn_res.question
        pending_turn.options_json = [opt.model_dump() for opt in turn_res.options]
        pending_turn.guardrail_triggered = turn_res.guardrail_triggered
        pending_turn.ai_source = turn_res.ai_source

    session.updated_at = utcnow()
    db.commit()
    return to_session_out(_get_user_session(db, user, session.id))


def force_generate_plan(db: Session, user: User, session_id: str) -> ThinkingSessionOut:
    session = _get_user_session(db, user, session_id)
    if session.phase in ("executing", "completed") and session.steps:
        return to_session_out(session)
    _build_and_save_plan(db, user, session)
    db.commit()
    db.expire_all()
    return to_session_out(_get_user_session(db, user, session.id))


def complete_step(
    db: Session,
    user: User,
    session_id: str,
    step_id: str,
    payload: CompleteStepIn,
) -> ThinkingSessionOut:
    session = _get_user_session(db, user, session_id)
    steps = sorted(session.steps, key=lambda s: s.order_index)
    target = next((s for s in steps if s.id == step_id), None)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action step not found")
    if target.status != "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only the currently active step can be completed")

    target.status = "completed"
    target.pomodoro_seconds = payload.elapsed_seconds
    target.reflection_note = payload.reflection_note.strip() if payload.reflection_note else None
    target.completed_at = utcnow()

    next_locked = next(
        (s for s in steps if s.status == "locked" and s.order_index > target.order_index),
        None,
    )
    if next_locked is not None:
        next_locked.status = "active"
        session_completed = False
    else:
        session.phase = "completed"
        session.completed_at = utcnow()
        session_completed = True

    session.updated_at = utcnow()

    completed_count_before = sum(1 for s in steps if s.status == "completed" and s.id != target.id)
    is_first_step_ever = completed_count_before == 0

    memory_service.update_cognitive_profile(
        user,
        blocker_type=session.detected_blocker if is_first_step_ever else None,
        framework_id=session.framework_id if is_first_step_ever else None,
        completed_steps_delta=1,
        completed_sessions_delta=1 if session_completed else 0,
        focus_seconds_delta=payload.elapsed_seconds,
    )

    if is_first_step_ever or session_completed:
        first_completed = next((s for s in steps if s.status == "completed"), target)
        summary_text = f"{session.title} — {session.summary or first_completed.title}"
        memory_service.record_session_memory(
            db,
            user=user,
            session_id=session.id,
            summary_text=summary_text,
            blocker_type=session.detected_blocker or "overwhelm",
            framework_id=session.framework_id,
            first_step_title=first_completed.title,
        )

    db.commit()
    db.expire_all()
    return to_session_out(_get_user_session(db, user, session.id))


def mark_step_stuck(db: Session, user: User, session_id: str, step_id: str) -> ThinkingSessionOut:
    session = _get_user_session(db, user, session_id)
    steps = sorted(session.steps, key=lambda s: s.order_index)
    target = next((s for s in steps if s.id == step_id), None)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action step not found")
    if target.status != "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only an active step can be split")
    remaining_slots = MAX_STEPS_PER_SESSION - len(steps)
    if remaining_slots < 1:
        limit_msg = (
            f"Досягнуто максимальну деталізацію плану ({MAX_STEPS_PER_SESSION} кроків). "
            "Подальше дроблення зупинено — увімкни таймер і виконай активний мікрокрок на 1–2 хвилини."
            if session.language == "uk"
            else f"Maximum step breakdown limit ({MAX_STEPS_PER_SESSION} steps) reached. "
            "Further splitting is paused — start the timer and complete the 1–2 minute active micro-step."
        )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, limit_msg)

    chat_messages = _build_chat_messages(session.messages)
    breakdown = bedrock_service.breakdown_stuck_step(
        problem=session.raw_problem,
        step_title=target.title,
        step_description=target.description,
        framework_id=session.framework_id,
        language=session.language,
        cognitive_profile=user.cognitive_profile,
        attachments=session.attachments_json,
        chat_messages=chat_messages,
    )

    selected_substeps = breakdown.substeps[: max(1, remaining_slots)]
    insert_count = len(selected_substeps)
    target.status = "split"
    base_index = target.order_index

    for step in steps:
        if step.order_index > base_index:
            step.order_index += insert_count

    for idx, sub in enumerate(selected_substeps):
        db.add(
            ActionStep(
                session_id=session.id,
                parent_step_id=target.id,
                order_index=base_index + idx + 1,
                title=sub.title,
                description=sub.description,
                duration_minutes=sub.duration_minutes,
                timer_mode=sub.timer_mode,
                status="active" if idx == 0 else "locked",
            )
        )

    session.updated_at = utcnow()
    db.commit()
    db.expire_all()
    return to_session_out(_get_user_session(db, user, session.id))


def send_chat_message(
    db: Session,
    user: User,
    session_id: str,
    payload: ChatMessageIn,
) -> ThinkingSessionOut:
    session = _get_user_session(db, user, session_id)
    if len(session.messages) >= MAX_MESSAGES_PER_SESSION:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Maximum chat message limit ({MAX_MESSAGES_PER_SESSION}) reached for this session",
        )
    content = payload.content.strip()
    new_attachments = _serialize_attachments(payload.attachments)
    if not content and not new_attachments:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Message content or file cannot be empty")

    if new_attachments:
        merged = [dict(item) for item in (session.attachments_json or [])]
        for att in new_attachments:
            existing_idx = next(
                (
                    idx
                    for idx, item in enumerate(merged)
                    if item.get("name") == att["name"] and item.get("size_bytes") == att["size_bytes"]
                ),
                -1,
            )
            if existing_idx >= 0:
                merged[existing_idx] = att
            else:
                merged.append(att)
        session.attachments_json = merged[-10:]

        attached_names = ", ".join(att["name"] for att in new_attachments)
        prefix = "Attached file" if session.language == "en" else "Прикріплено файл"
        if content:
            stored_content = f"{content}\n\n[{prefix}: {attached_names}]"
        else:
            stored_content = f"{prefix}: {attached_names}"
    else:
        stored_content = content

    user_msg = SessionMessage(
        session_id=session.id,
        role="user",
        content=stored_content,
        ai_source="user",
        created_at=utcnow(),
    )
    db.add(user_msg)
    db.flush()

    memories = [MemoryMatch(**m) for m in (session.memory_insight or [])]
    unique_messages = list({m.id: m for m in [*session.messages, user_msg]}.values())
    history_messages = _build_chat_messages(unique_messages)
    reply_res = bedrock_service.generate_chat_reply(
        problem=session.raw_problem,
        phase=session.phase,
        framework_id=session.framework_id,
        language=session.language,
        messages=history_messages,
        turns=_serialize_session_turns_for_chat(session.turns),
        steps=_serialize_steps_for_chat(session.steps),
        memories=memories,
        cognitive_profile=user.cognitive_profile,
        attachments=session.attachments_json,
    )

    assistant_msg = SessionMessage(
        session_id=session.id,
        role="assistant",
        content=reply_res.reply,
        ai_source=_encode_chat_ai_source(
            reply_res.ai_source,
            reply_res.conversation_complete,
        ),
        created_at=utcnow(),
    )
    db.add(assistant_msg)
    session.updated_at = utcnow()
    db.commit()
    db.expire_all()
    return to_session_out(_get_user_session(db, user, session.id))


def delete_session(db: Session, user: User, session_id: str) -> None:
    session = _get_user_session(db, user, session_id)
    db.execute(
        delete(MemoryEmbedding).where(
            MemoryEmbedding.session_id == session.id,
            MemoryEmbedding.user_id == user.id,
        )
    )
    db.delete(session)
    db.commit()
