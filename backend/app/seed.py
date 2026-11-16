"""Idempotent seed script for local development & demo readiness."""

import logging

from sqlalchemy import func, select

from app.ai import memory_service
from app.auth import LOCAL_IDENTITY
from app.config import settings
from app.db import SessionLocal
from app.models import MemoryEmbedding
from app.services import users as users_service

logger = logging.getLogger(__name__)

SAMPLE_MEMORIES = [
    {
        "summary_text": (
            "Задача: Підготовка архітектурної доповіді з ООАП. Блокер: perfectionism. Метод: inversion."
        ),
        "blocker_type": "perfectionism",
        "framework_id": "inversion",
        "first_step_title": "Створити 4 слайди-заглушки лише з тезами без дизайну (3 хв)",
    },
    {
        "summary_text": (
            "Задача: Розбір лабораторної роботи з патернів проектування. "
            "Блокер: overwhelm. Метод: first_principles."
        ),
        "blocker_type": "overwhelm",
        "framework_id": "first_principles",
        "first_step_title": "Виписати в один список лише вхідні типи та очікуваний результат (2 хв)",
    },
]


def main() -> None:
    if not settings.seed:
        return

    with SessionLocal() as db:
        user = users_service.get_or_create(
            db,
            cognito_sub=LOCAL_IDENTITY.sub,
            email=LOCAL_IDENTITY.email,
            name=LOCAL_IDENTITY.name,
        )
        existing_count = db.scalar(
            select(func.count(MemoryEmbedding.id)).where(MemoryEmbedding.user_id == user.id)
        )
        if existing_count and existing_count > 0:
            return

        for item in SAMPLE_MEMORIES:
            vector, _ = memory_service.embed_text(item["summary_text"])
            db.add(
                MemoryEmbedding(
                    user_id=user.id,
                    session_id=None,
                    summary_text=item["summary_text"],
                    blocker_type=item["blocker_type"],
                    framework_id=item["framework_id"],
                    first_step_title=item["first_step_title"],
                    embedding=vector,
                )
            )
            memory_service.update_cognitive_profile(
                user,
                blocker_type=item["blocker_type"],
                framework_id=item["framework_id"],
                completed_steps_delta=2,
                completed_sessions_delta=1,
                focus_seconds_delta=600,
            )
        db.commit()
        logger.info("Seeded %d initial cognitive memory episodes", len(SAMPLE_MEMORIES))


if __name__ == "__main__":
    main()
