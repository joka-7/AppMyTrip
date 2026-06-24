"""Session-token based auth (no OAuth/JWT).

Passwords are hashed with bcrypt. On login, an opaque token
(`secrets.token_urlsafe(32)`) is issued and stored in the `sessions` table;
clients send it back as `Authorization: Bearer <token>`.
"""

import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session as DBSession

from db import get_db
from models_db import Session as SessionModel
from models_db import User

SESSION_TTL = timedelta(days=30)


def _utcnow() -> datetime:
    """Naive UTC, matching the storage convention in models_db.py."""
    return datetime.now(UTC).replace(tzinfo=None)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def issue_session(db: DBSession, user: User) -> str:
    token = secrets.token_urlsafe(32)
    session = SessionModel(
        user_id=user.id,
        token=token,
        expires_at=_utcnow() + SESSION_TTL,
    )
    db.add(session)
    db.commit()
    return token


def _extract_token(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header.removeprefix("Bearer ").strip() or None


def _lookup_user(db: DBSession, token: str) -> User | None:
    session = db.query(SessionModel).filter(SessionModel.token == token).first()
    if session is None:
        return None
    if session.expires_at < _utcnow():
        return None
    return session.user


def get_optional_user(request: Request, db: DBSession = Depends(get_db)) -> User | None:
    token = _extract_token(request)
    if token is None:
        return None
    return _lookup_user(db, token)


def get_current_user(request: Request, db: DBSession = Depends(get_db)) -> User:
    token = _extract_token(request)
    user = _lookup_user(db, token) if token else None
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def revoke_session(db: DBSession, token: str) -> None:
    db.query(SessionModel).filter(SessionModel.token == token).delete()
    db.commit()
