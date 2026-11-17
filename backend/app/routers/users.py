from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import User
from app.schemas import UpdateSubscriptionIn, UpdateUserIn, UserProfileOut
from app.services import users as users_service

router = APIRouter(prefix="/api", tags=["users"])


def _to_user_profile_out(user: User) -> UserProfileOut:
    return UserProfileOut(
        id=user.id,
        email=user.email,
        name=user.name,
        cognitive_profile=user.cognitive_profile,
        subscription=users_service.get_subscription(user),
        auth_enabled=settings.auth_enabled,
        created_at=user.created_at,
    )


@router.get("/me", response_model=UserProfileOut)
def get_me(user: User = Depends(get_current_user)) -> UserProfileOut:
    return _to_user_profile_out(user)


@router.patch("/me", response_model=UserProfileOut)
def update_me(
    payload: UpdateUserIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfileOut:
    updated = users_service.update_name(db, user, payload.name)
    return _to_user_profile_out(updated)


@router.post("/me/subscription", response_model=UserProfileOut)
def update_subscription(
    payload: UpdateSubscriptionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfileOut:
    updated = users_service.update_subscription(db, user, payload.tier)
    return _to_user_profile_out(updated)
