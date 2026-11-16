from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User, default_cognitive_profile


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
