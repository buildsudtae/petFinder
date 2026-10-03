from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.deps import current_user
from app.domain.auth import service
from app.domain.auth.models import User
from app.domain.auth.schemas import LoginIn, RegisterIn, UserOut
from app.domain.auth.security import COOKIE_NAME, SESSION_HOURS, issue_token

router = APIRouter(prefix="/api", tags=["auth"])


def _set_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        issue_token(user_id),
        max_age=SESSION_HOURS * 3600,
        httponly=True,
        samesite="strict",
        secure=get_settings().cookie_secure,
        path="/",
    )


@router.post("/auth/register", status_code=status.HTTP_201_CREATED, response_model=UserOut)
def register(payload: RegisterIn, db: Session = Depends(get_session)):
    user = service.register(db, payload.email, payload.password, payload.display_name)
    return UserOut(id=str(user.id), display_name=user.display_name)


@router.post("/auth/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_session)):
    user = service.authenticate(db, payload.email, payload.password)
    _set_cookie(response, str(user.id))
    return UserOut(id=str(user.id), display_name=user.display_name)


@router.post("/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return UserOut(id=str(user.id), display_name=user.display_name)
