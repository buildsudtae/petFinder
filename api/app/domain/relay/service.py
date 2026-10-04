from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.relay.models import RelayMessage, RelayThread
from app.domain.reports.service import get_report_or_404
from app.domain.sightings.models import Sighting
from app.errors import AppError

NO_ACCESS = "คุณต้องส่งเบาะแสในประกาศนี้ก่อนจึงจะคุยกับเจ้าของได้"


def _thread_for(db: Session, report, user: User, create: bool) -> RelayThread | None:
    is_owner = report.owner_id == user.id
    if is_owner:
        return None                    # เจ้าของตอบได้ทุก thread ของประกาศตัวเอง
    has_sighting = db.scalar(
        select(Sighting.id).where(Sighting.report_id == report.id, Sighting.finder_id == user.id).limit(1)
    )
    if not has_sighting:
        raise AppError("FORBIDDEN", NO_ACCESS)
    thread = db.scalar(
        select(RelayThread).where(RelayThread.report_id == report.id, RelayThread.finder_id == user.id)
    )
    if thread is None and create:
        thread = RelayThread(report_id=report.id, finder_id=user.id)
        db.add(thread)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            thread = db.scalar(
                select(RelayThread).where(RelayThread.report_id == report.id, RelayThread.finder_id == user.id)
            )
    return thread


def send_message(db: Session, report_id: str, user: User, body: str) -> RelayMessage:
    if not body.strip():
        raise AppError("VALIDATION", "ข้อความต้องไม่ว่าง", field="body")
    report = get_report_or_404(db, report_id)
    thread = _thread_for(db, report, user, create=True)

    if thread is None:                 # เจ้าของส่ง: ต้องมี thread ของ finder อยู่แล้วเท่านั้น
        threads = list(db.scalars(select(RelayThread).where(RelayThread.report_id == report.id)))
        if len(threads) != 1:
            raise AppError("VALIDATION",
                           "ประกาศนี้มีผู้ส่งเบาะแสหลายคน กรุณาเลือกคู่สนทนาจากหน้ารายละเอียด"
                           if threads else "ยังไม่มีผู้ส่งเบาะแสในประกาศนี้", field="thread_id")
        thread = threads[0]

    message = RelayMessage(thread_id=thread.id, sender_id=user.id, body=body.strip())
    db.add(message)
    db.commit()
    return message


def list_messages(db: Session, report_id: str, user: User) -> list[tuple[RelayMessage, str]]:
    report = get_report_or_404(db, report_id)
    is_owner = report.owner_id == user.id
    if is_owner:
        stmt = (
            select(RelayMessage, User.display_name)
            .join(RelayThread, RelayThread.id == RelayMessage.thread_id)
            .join(User, User.id == RelayMessage.sender_id)
            .where(RelayThread.report_id == report.id)
        )
    else:
        thread = db.scalar(
            select(RelayThread).where(RelayThread.report_id == report.id, RelayThread.finder_id == user.id)
        )
        if thread is None:
            return []
        stmt = (
            select(RelayMessage, User.display_name)
            .join(User, User.id == RelayMessage.sender_id)
            .where(RelayMessage.thread_id == thread.id)
        )
    return list(db.execute(stmt.order_by(RelayMessage.id)).all())
