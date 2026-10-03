from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.auth.security import hash_password, verify_password
from app.errors import AppError

BAD_CREDENTIALS = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"


def register(db: Session, email: str, password: str, display_name: str) -> User:
    user = User(email=email.lower(), password_hash=hash_password(password), display_name=display_name)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("VALIDATION", "อีเมลนี้ถูกใช้สมัครไว้แล้ว", field="email")
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    # เช็ค user ก่อนแล้วค่อยเช็ครหัส แต่คืนข้อความเดียวกันทั้งสองกรณี (ไม่บอกว่าผิดช่องไหน)
    if user is None or not verify_password(password, user.password_hash):
        raise AppError("AUTH_REQUIRED", BAD_CREDENTIALS)
    return user
