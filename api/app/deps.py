from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.db import get_session
from app.domain.auth.models import User
from app.domain.auth.security import COOKIE_NAME, read_token
from app.errors import AppError


def current_user(request: Request, db: Session = Depends(get_session)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    user_id = read_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise AppError("AUTH_REQUIRED", "กรุณาเข้าสู่ระบบก่อนใช้งาน")
    return user
