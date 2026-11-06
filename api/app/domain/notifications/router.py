from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.notifications.models import Notification
from app.domain.notifications.schemas import MarkReadIn, NotificationList, NotificationOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
PAGE = 50


def _out(n: Notification) -> NotificationOut:
    return NotificationOut(id=n.id, topic=n.topic, report_id=n.payload.get("report_id"),
                           status_to=n.payload.get("to"), created_at=n.created_at, read=n.read_at is not None)


@router.get("", response_model=NotificationList)
def inbox(db: Session = Depends(get_session), user: User = Depends(current_user)):
    # แจ้งเตือนมาจาก worker (async) จึงอาจตามหลังเหตุการณ์จริงไม่กี่วินาที — C5
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id)
                      .order_by(Notification.id.desc()).limit(PAGE))
    unread = db.scalar(select(func.count(Notification.id))
                       .where(Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    return NotificationList(items=[_out(n) for n in rows], unread_count=unread)


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(payload: MarkReadIn, db: Session = Depends(get_session), user: User = Depends(current_user)):
    stmt = (update(Notification)
            .where(Notification.user_id == user.id, Notification.read_at.is_(None))
            .values(read_at=func.now()))
    if payload.report_id is not None:
        stmt = stmt.where(Notification.payload["report_id"].astext == payload.report_id)
    db.execute(stmt)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
