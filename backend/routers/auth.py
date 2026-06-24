from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from auth import get_current_user, hash_password, issue_session, revoke_session, verify_password
from db import get_db
from models_db import User

router = APIRouter(prefix="/api/auth", tags=["auth"])
me_router = APIRouter(prefix="/api/me", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    email: str


@router.post("/register", response_model=AuthResponse)
def register(request: RegisterRequest, db: DBSession = Depends(get_db)) -> AuthResponse:
    existing = db.query(User).filter(User.email == request.email).first()
    if existing is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=request.email, hashed_password=hash_password(request.password))
    db.add(user)
    db.commit()

    token = issue_session(db, user)
    return AuthResponse(token=token, email=user.email)


@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest, db: DBSession = Depends(get_db)) -> AuthResponse:
    user = db.query(User).filter(User.email == request.email).first()
    if user is None or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = issue_session(db, user)
    return AuthResponse(token=token, email=user.email)


@router.post("/logout")
def logout(request: Request, db: DBSession = Depends(get_db)) -> dict:
    header = request.headers.get("Authorization", "")
    token = header.removeprefix("Bearer ").strip() if header.startswith("Bearer ") else None
    if token:
        revoke_session(db, token)
    return {"status": "logged out"}


class PreferencesRequest(BaseModel):
    preferences_text: str | None = None


class MeResponse(BaseModel):
    email: str
    preferences_text: str | None


@me_router.get("", response_model=MeResponse)
def get_me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(email=user.email, preferences_text=user.preferences_text)


@me_router.put("/preferences", response_model=MeResponse)
def update_preferences(
    request: PreferencesRequest,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> MeResponse:
    user.preferences_text = request.preferences_text
    db.add(user)
    db.commit()
    return MeResponse(email=user.email, preferences_text=user.preferences_text)
