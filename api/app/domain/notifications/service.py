from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.notifications.models import Notification


def notify_once(db: Session, user_id, topic: str, dedupe_key: str, payload: dict) -> bool:
    """คืน True ถ้าสร้างใหม่ · False ถ้ามีอยู่แล้ว (task ถูกส่งซ้ำ)"""
    db.add(Notification(user_id=user_id, topic=topic, dedupe_key=dedupe_key, payload=payload))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False
