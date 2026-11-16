"""Episodic vector memory (AWS Bedrock Titan Embeddings + pgvector) and cognitive profile."""

import hashlib
import json
import logging
import math
import re
from typing import Any

import boto3
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import MemoryEmbedding, User, default_cognitive_profile
from app.schemas import MemoryMatch

logger = logging.getLogger(__name__)
TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def _bedrock_runtime_client() -> Any:
    kwargs: dict[str, Any] = {"region_name": settings.bedrock_region}
    if settings.aws_access_key_id:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
    if settings.aws_secret_access_key:
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    if settings.aws_session_token:
        kwargs["aws_session_token"] = settings.aws_session_token
    return boto3.client("bedrock-runtime", **kwargs)


def deterministic_embedding(text: str, dim: int = settings.bedrock_embedding_dim) -> list[float]:
    """Deterministic normalized n-gram projection for offline/local fallback and unit tests."""
    vec = [0.0] * dim
    cleaned = text.lower().strip()
    tokens = TOKEN_RE.findall(cleaned)
    features: list[str] = list(tokens)
    for token in tokens:
        if len(token) >= 3:
            for idx in range(len(token) - 2):
                features.append(token[idx : idx + 3])
    if not features:
        features = ["empty"]

    for feat in features:
        digest = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest[:4], "little") % dim
        sign = 1.0 if (digest[4] & 1) == 0 else -1.0
        vec[bucket] += sign

    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0.0:
        vec[0] = 1.0
        return vec
    return [v / norm for v in vec]


def embed_text(text: str) -> tuple[list[float], str]:
    """Generate a 1024-dim embedding using AWS Bedrock Titan v2 with deterministic fallback."""
    try:
        client = _bedrock_runtime_client()
        payload = json.dumps(
            {
                "inputText": text[:8000],
                "dimensions": settings.bedrock_embedding_dim,
                "normalize": True,
            }
        )
        response = client.invoke_model(
            modelId=settings.bedrock_embedding_model_id,
            body=payload,
            contentType="application/json",
            accept="application/json",
        )
        body = json.loads(response["body"].read())
        embedding = [float(x) for x in body["embedding"]]
        if len(embedding) == settings.bedrock_embedding_dim:
            return embedding, "bedrock"
    except Exception as exc:
        if not settings.ai_fallback_enabled:
            raise
        logger.warning("Titan embedding fallback engaged: %s", exc, exc_info=True)

    return deterministic_embedding(text), "fallback"


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def search_similar_memories(
    db: Session,
    user_id: str,
    query_text: str,
    *,
    limit: int = 3,
    min_similarity: float = 0.30,
) -> list[MemoryMatch]:
    query_vec, _ = embed_text(query_text)
    dialect_name = db.bind.dialect.name if db.bind is not None else "sqlite"

    if dialect_name == "postgresql":
        distance_expr = MemoryEmbedding.embedding.cosine_distance(query_vec)
        stmt = (
            select(MemoryEmbedding, (1.0 - distance_expr).label("similarity"))
            .where(MemoryEmbedding.user_id == user_id)
            .order_by(distance_expr.asc())
            .limit(limit)
        )
        rows = db.execute(stmt).all()
        matches: list[MemoryMatch] = []
        for mem, similarity in rows:
            sim_val = round(float(similarity), 3)
            if sim_val >= min_similarity:
                matches.append(
                    MemoryMatch(
                        id=mem.id,
                        summary_text=mem.summary_text,
                        blocker_type=mem.blocker_type,
                        framework_id=mem.framework_id,
                        first_step_title=mem.first_step_title,
                        similarity=sim_val,
                        created_at=mem.created_at,
                    )
                )
        return matches

    records = db.scalars(select(MemoryEmbedding).where(MemoryEmbedding.user_id == user_id)).all()
    scored: list[tuple[float, MemoryEmbedding]] = []
    for mem in records:
        sim = cosine_similarity(query_vec, mem.embedding)
        if sim >= min_similarity:
            scored.append((sim, mem))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        MemoryMatch(
            id=mem.id,
            summary_text=mem.summary_text,
            blocker_type=mem.blocker_type,
            framework_id=mem.framework_id,
            first_step_title=mem.first_step_title,
            similarity=round(sim, 3),
            created_at=mem.created_at,
        )
        for sim, mem in scored[:limit]
    ]


def record_session_memory(
    db: Session,
    *,
    user: User,
    session_id: str,
    summary_text: str,
    blocker_type: str,
    framework_id: str,
    first_step_title: str | None,
) -> MemoryEmbedding:
    vector, _ = embed_text(f"{summary_text} | blocker:{blocker_type} | method:{framework_id}")
    existing = db.scalar(select(MemoryEmbedding).where(MemoryEmbedding.session_id == session_id))
    if existing is not None:
        existing.summary_text = summary_text
        existing.blocker_type = blocker_type
        existing.framework_id = framework_id
        existing.first_step_title = first_step_title
        existing.embedding = vector
        db.flush()
        return existing

    memory = MemoryEmbedding(
        user_id=user.id,
        session_id=session_id,
        summary_text=summary_text,
        blocker_type=blocker_type,
        framework_id=framework_id,
        first_step_title=first_step_title,
        embedding=vector,
    )
    db.add(memory)
    db.flush()
    return memory


def update_cognitive_profile(
    user: User,
    *,
    blocker_type: str | None = None,
    framework_id: str | None = None,
    completed_steps_delta: int = 0,
    completed_sessions_delta: int = 0,
    focus_seconds_delta: int = 0,
) -> None:
    profile = {**default_cognitive_profile(), **(user.cognitive_profile or {})}
    blocker_counts = dict(profile.get("blocker_counts") or {})
    effective_frameworks = dict(profile.get("effective_frameworks") or {})

    if blocker_type:
        blocker_counts[blocker_type] = int(blocker_counts.get(blocker_type, 0)) + 1
    if framework_id:
        effective_frameworks[framework_id] = int(effective_frameworks.get(framework_id, 0)) + 1

    profile["blocker_counts"] = blocker_counts
    profile["effective_frameworks"] = effective_frameworks
    profile["completed_steps"] = int(profile.get("completed_steps", 0)) + completed_steps_delta
    profile["completed_sessions"] = int(profile.get("completed_sessions", 0)) + completed_sessions_delta
    profile["total_focus_seconds"] = int(profile.get("total_focus_seconds", 0)) + focus_seconds_delta
    if completed_steps_delta > 0:
        profile["current_streak"] = int(profile.get("current_streak", 0)) + completed_steps_delta

    user.cognitive_profile = profile


def list_user_memories(db: Session, user_id: str, limit: int = 20) -> list[MemoryMatch]:
    records = db.scalars(
        select(MemoryEmbedding)
        .where(MemoryEmbedding.user_id == user_id)
        .order_by(MemoryEmbedding.created_at.desc())
        .limit(limit)
    ).all()
    return [
        MemoryMatch(
            id=mem.id,
            summary_text=mem.summary_text,
            blocker_type=mem.blocker_type,
            framework_id=mem.framework_id,
            first_step_title=mem.first_step_title,
            similarity=1.0,
            created_at=mem.created_at,
        )
        for mem in records
    ]
