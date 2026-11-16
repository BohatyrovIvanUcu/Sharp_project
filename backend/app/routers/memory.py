from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai import memory_service
from app.auth import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import MemoryOverviewOut

router = APIRouter(prefix="/api", tags=["memory"])


@router.get("/memory", response_model=MemoryOverviewOut)
def get_memory_overview(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryOverviewOut:
    memories = memory_service.list_user_memories(db, user.id, limit=25)
    return MemoryOverviewOut(
        cognitive_profile=user.cognitive_profile,
        memories=memories,
    )
