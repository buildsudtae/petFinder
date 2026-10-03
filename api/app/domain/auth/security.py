from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.config import get_settings

_ph = PasswordHasher()
COOKIE_NAME = "pettech_session"
SESSION_HOURS = 12


def hash_password(raw: str) -> str:
    return _ph.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, raw)
    except VerifyMismatchError:
        return False


def issue_token(user_id: str) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(hours=SESSION_HOURS)},
        s.jwt_secret,
        algorithm="HS256",
    )


def read_token(token: str) -> str | None:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])["sub"]
    except (JWTError, KeyError):
        return None
