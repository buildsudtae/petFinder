import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.relay.models import RelayMessage, RelayRead, RelayThread
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


def _thread_of_report(db: Session, report, thread_id: str) -> RelayThread:
    try:
        tid = uuid.UUID(thread_id)
    except ValueError:
        raise AppError("NOT_FOUND", "ไม่พบบทสนทนานี้")
    thread = db.scalar(select(RelayThread).where(RelayThread.id == tid, RelayThread.report_id == report.id))
    if thread is None:
        raise AppError("NOT_FOUND", "ไม่พบบทสนทนานี้")
    return thread


def _own_finder_thread(db: Session, report, user: User, thread_id: str | None) -> RelayThread | None:
    """thread ของผู้พบคนนี้ (ถ้ามี) — ขอ thread ของคนอื่นด้วย thread_id = 403 ไม่ใช่ข้อมูลของคนอื่น"""
    thread = db.scalar(
        select(RelayThread).where(RelayThread.report_id == report.id, RelayThread.finder_id == user.id)
    )
    if thread_id is not None and (thread is None or str(thread.id) != thread_id):
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์ในบทสนทนานี้")
    return thread


def _owner_thread(db: Session, report, thread_id: str | None = None) -> RelayThread:
    """เจ้าของเลือก thread ด้วย thread_id ได้; ไม่ระบุ -> ใช้ได้เมื่อมี thread เดียว ไม่งั้น 422"""
    if thread_id is not None:
        return _thread_of_report(db, report, thread_id)
    threads = list(db.scalars(select(RelayThread).where(RelayThread.report_id == report.id)))
    if len(threads) != 1:
        raise AppError("VALIDATION",
                       "ประกาศนี้มีผู้ส่งเบาะแสหลายคน กรุณาเลือกคู่สนทนาจากหน้ารายละเอียด"
                       if threads else "ยังไม่มีผู้ส่งเบาะแสในประกาศนี้", field="thread_id")
    return threads[0]


def send_message(db: Session, report_id: str, user: User, body: str, thread_id: str | None = None) -> RelayMessage:
    if not body.strip():
        raise AppError("VALIDATION", "ข้อความต้องไม่ว่าง", field="body")
    report = get_report_or_404(db, report_id)

    if report.owner_id == user.id:
        thread = _owner_thread(db, report, thread_id)
    else:
        thread = _finder_thread(db, report, user)   # ไม่ใช่เจ้าของและไม่เคยส่งเบาะแส -> 403
        if thread_id is not None and str(thread.id) != thread_id:
            raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์ในบทสนทนานี้")

    message = RelayMessage(thread_id=thread.id, sender_id=user.id, body=body.strip())
    db.add(message)
    db.commit()
    return message


def list_messages(db: Session, report_id: str, user: User,
                  thread_id: str | None = None) -> list[tuple[RelayMessage, str]]:
    report = get_report_or_404(db, report_id)
    is_owner = report.owner_id == user.id
    if is_owner and thread_id is not None:
        stmt = (
            select(RelayMessage, User.display_name)
            .join(User, User.id == RelayMessage.sender_id)
            .where(RelayMessage.thread_id == _thread_of_report(db, report, thread_id).id)
        )
    elif is_owner:
        stmt = (
            select(RelayMessage, User.display_name)
            .join(RelayThread, RelayThread.id == RelayMessage.thread_id)
            .join(User, User.id == RelayMessage.sender_id)
            .where(RelayThread.report_id == report.id)
        )
    else:
        thread = _own_finder_thread(db, report, user, thread_id)
        if thread is None:
            return []
        stmt = (
            select(RelayMessage, User.display_name)
            .join(User, User.id == RelayMessage.sender_id)
            .where(RelayMessage.thread_id == thread.id)
        )
    return list(db.execute(stmt.order_by(RelayMessage.id)).all())


def _last_read_id(db: Session, thread_id, user: User) -> int:
    return db.scalar(
        select(RelayRead.last_read_message_id).where(RelayRead.thread_id == thread_id, RelayRead.user_id == user.id)
    ) or 0


def list_threads(db: Session, report_id: str, user: User) -> list[dict]:
    """เจ้าของเห็นทุก thread ของประกาศ · ผู้พบเห็นเห็นเฉพาะของตัวเอง · คนนอกได้รายการว่าง
    ไม่คืน id ผู้ใช้หรือข้อมูลติดต่อ — id ที่คืนคือ id ของ thread ใช้เลือกคู่สนทนาเท่านั้น"""
    report = get_report_or_404(db, report_id)
    if report.owner_id == user.id:
        threads = list(db.scalars(select(RelayThread).where(RelayThread.report_id == report.id)))
    else:
        own = _own_finder_thread(db, report, user, None)
        threads = [own] if own else []

    items = []
    for t in threads:
        finder_name = db.scalar(select(User.display_name).where(User.id == t.finder_id))
        sighting = db.execute(
            select(Sighting.district, Sighting.area_note)
            .where(Sighting.report_id == report.id, Sighting.finder_id == t.finder_id)
            .order_by(Sighting.created_at.desc()).limit(1)
        ).first()
        last = db.scalar(
            select(RelayMessage).where(RelayMessage.thread_id == t.id).order_by(RelayMessage.id.desc()).limit(1)
        )
        unread = db.scalar(
            select(func.count(RelayMessage.id)).where(
                RelayMessage.thread_id == t.id,
                RelayMessage.sender_id != user.id,
                RelayMessage.id > _last_read_id(db, t.id, user),
            )
        ) or 0
        items.append({
            "id": str(t.id), "finder_display_name": finder_name,
            "sighting_district": sighting.district if sighting else None,
            "sighting_area_note": sighting.area_note if sighting else None,
            "last_message": last.body if last else None,
            "last_message_at": last.created_at if last else None,
            "last_message_mine": bool(last and last.sender_id == user.id),
            "unread_count": unread,
        })
    # คุยล่าสุดขึ้นก่อน thread ที่ยังไม่มีข้อความอยู่ท้าย
    items.sort(key=lambda i: (i["last_message_at"] is not None, i["last_message_at"] or 0), reverse=True)
    return items


def mark_read(db: Session, report_id: str, user: User, thread_id: str) -> None:
    """บันทึกว่าอ่านถึงข้อความล่าสุดของ thread แล้ว — ค่าไม่ถอยหลังแม้คำขอมาสลับลำดับ"""
    report = get_report_or_404(db, report_id)
    if report.owner_id == user.id:
        thread = _thread_of_report(db, report, thread_id)
    else:
        thread = _own_finder_thread(db, report, user, thread_id)
    latest = db.scalar(select(func.max(RelayMessage.id)).where(RelayMessage.thread_id == thread.id))
    if latest is None:
        return
    stmt = insert(RelayRead).values(thread_id=thread.id, user_id=user.id, last_read_message_id=latest)
    db.execute(stmt.on_conflict_do_update(
        index_elements=[RelayRead.thread_id, RelayRead.user_id],
        set_={"last_read_message_id": func.greatest(RelayRead.last_read_message_id,
                                                    stmt.excluded.last_read_message_id),
              "updated_at": func.now()},
    ))
    db.commit()
