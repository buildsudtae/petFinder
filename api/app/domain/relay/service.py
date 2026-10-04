from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.relay.models import RelayMessage, RelayThread
from app.domain.reports.service import get_report_or_404
from app.domain.sightings.models import Sighting
from app.errors import AppError

NO_ACCESS = "คุณต้องส่งเบาะแสในประกาศนี้ก่อนจึงจะคุยกับเจ้าของได้"


def _finder_thread(db: Session, report, user: User) -> RelayThread:
    """Thread of a finder who has sent a sighting on this report (created on first use).

    Never returns None: no sighting -> 403, and a failed insert that is not the
    uq_relay_thread race is re-raised rather than swallowed.
    """
    has_sighting = db.scalar(
        select(Sighting.id).where(Sighting.report_id == report.id, Sighting.finder_id == user.id).limit(1)
    )
    if not has_sighting:
        raise AppError("FORBIDDEN", NO_ACCESS)

    def _select() -> RelayThread | None:
        return db.scalar(
            select(RelayThread).where(RelayThread.report_id == report.id, RelayThread.finder_id == user.id)
        )

    thread = _select()
    if thread is None:
        thread = RelayThread(report_id=report.id, finder_id=user.id)
        db.add(thread)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            thread = _select()
            if thread is None:          # not the unique race (FK error, winner rolled back): fail loudly
                raise
    return thread


def _owner_thread(db: Session, report) -> RelayThread:
    """เจ้าของตอบได้เมื่อมี thread เดียว; หลาย thread หรือไม่มีเลย -> 422"""
    threads = list(db.scalars(select(RelayThread).where(RelayThread.report_id == report.id)))
    if len(threads) != 1:
        raise AppError("VALIDATION",
                       "ประกาศนี้มีผู้ส่งเบาะแสหลายคน กรุณาเลือกคู่สนทนาจากหน้ารายละเอียด"
                       if threads else "ยังไม่มีผู้ส่งเบาะแสในประกาศนี้", field="thread_id")
    return threads[0]


def send_message(db: Session, report_id: str, user: User, body: str) -> RelayMessage:
    if not body.strip():
        raise AppError("VALIDATION", "ข้อความต้องไม่ว่าง", field="body")
    report = get_report_or_404(db, report_id)

    if report.owner_id == user.id:
        thread = _owner_thread(db, report)
    else:
        thread = _finder_thread(db, report, user)   # ไม่ใช่เจ้าของและไม่เคยส่งเบาะแส -> 403

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
