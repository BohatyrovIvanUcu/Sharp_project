from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import User
from app.schemas import UpdateUserIn, UserProfileOut
from app.services import users as users_service

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/me", response_model=UserProfileOut)
def get_me(user: User = Depends(get_current_user)) -> UserProfileOut:
    return UserProfileOut(
        id=user.id,
        email=user.email,
        name=user.name,
        cognitive_profile=user.cognitive_profile,
        auth_enabled=settings.auth_enabled,
        created_at=user.created_at,
    )


@router.patch("/me", response_model=UserProfileOut)
def update_me(
    payload: UpdateUserIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfileOut:
    updated = users_service.update_name(db, user, payload.name)
    return UserProfileOut(
        id=updated.id,
        email=updated.email,
        name=updated.name,
        cognitive_profile=updated.cognitive_profile,
        auth_enabled=settings.auth_enabled,
        created_at=updated.created_at,
    )
