from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, default_cognitive_profile
from app.schemas import SubscriptionStatusOut, SubscriptionTier, UserProfileOut


def _find_user(db: Session, cognito_sub: str, email: str = "") -> User | None:
    return db.scalar(select(User).where(User.cognito_sub == cognito_sub))


def get_or_create(db: Session, cognito_sub: str, email: str, name: str | None) -> User:
    user = _find_user(db, cognito_sub, email)
    if user is None:
        email_owner = db.scalar(select(User).where(User.email == email))
        if email_owner is not None and email_owner.cognito_sub != cognito_sub:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Account identity mismatch for this email address.",
            )
        user = User(
            cognito_sub=cognito_sub,
            email=email,
            name=name,
            cognitive_profile=default_cognitive_profile(),
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
            return user
        except IntegrityError:
            db.rollback()
            user = _find_user(db, cognito_sub, email)
            if user is None:
                email_owner = db.scalar(select(User).where(User.email == email))
                if email_owner is not None:
                    raise HTTPException(
                        status.HTTP_409_CONFLICT,
                        "Account identity mismatch for this email address.",
                    ) from None
                raise

    changed = False
    if name and not user.name:
        user.name = name
        changed = True
    if changed:
        db.commit()
        db.refresh(user)
    return user


def update_name(db: Session, user: User, name: str | None) -> User:
    user.name = name.strip() if name and name.strip() else None
    db.commit()
    db.refresh(user)
    return user


def get_subscription(user: User) -> SubscriptionStatusOut:
    profile = user.cognitive_profile or {}
    raw_sub = profile.get("subscription")
    if isinstance(raw_sub, dict):
        tier: SubscriptionTier = "pro" if raw_sub.get("tier") == "pro" else "free"
        is_pro = tier == "pro"
        return SubscriptionStatusOut(
            tier=tier,
            audio_coach_enabled=bool(raw_sub.get("audio_coach_enabled", is_pro)),
            video_explainer_enabled=bool(raw_sub.get("video_explainer_enabled", is_pro)),
        )
    return SubscriptionStatusOut()


def update_subscription(db: Session, user: User, tier: SubscriptionTier) -> User:
    profile = {**default_cognitive_profile(), **(user.cognitive_profile or {})}
    is_pro = tier == "pro"
    profile["subscription"] = {
        "tier": tier,
        "audio_coach_enabled": is_pro,
        "video_explainer_enabled": is_pro,
    }
    user.cognitive_profile = profile
    db.commit()
    db.refresh(user)
    return user


def to_user_profile_out(user: User) -> UserProfileOut:
    return UserProfileOut(
        id=user.id,
        email=user.email,
        name=user.name,
        cognitive_profile=user.cognitive_profile,
        subscription=get_subscription(user),
        auth_enabled=settings.auth_enabled,
        created_at=user.created_at,
    )
