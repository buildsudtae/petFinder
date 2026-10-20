import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.domain.pets.service import get_owned_pet
from app.domain.reports.models import (
    HAS_LEAD, OPEN_STATUSES, RESOLVED, SEARCHING, LostReport, ReportEvent,
)
from app.domain.sightings.models import Sighting
from app.errors import AppError
from app.outbox import enqueue


def create_report(db: Session, user: User, pet_id: str, **fields) -> LostReport:
    try:
        pid = uuid.UUID(pet_id)
    except ValueError:
        raise AppError("VALIDATION", "รหัสสัตว์เลี้ยงไม่ถูกต้อง", field="pet_id")
    get_owned_pet(db, pid, user)               # ยืนยันสิทธิ์ก่อนสร้าง (403 ถ้าไม่ใช่เจ้าของ)
    report = LostReport(pet_id=pid, owner_id=user.id, status=SEARCHING, **fields)
    db.add(report)
    db.flush()
    db.add(ReportEvent(report_id=report.id, actor_id=user.id, from_status=None, to_status=SEARCHING))
    db.commit()
    return report


def get_report_or_404(db: Session, report_id: str) -> LostReport:
    try:
        rid = uuid.UUID(report_id)
    except ValueError:
        raise AppError("NOT_FOUND", "ไม่พบประกาศที่ระบุ")
    report = db.get(LostReport, rid)
    if report is None:
        raise AppError("NOT_FOUND", "ไม่พบประกาศที่ระบุ")
    return report


def search(db: Session, species=None, district=None, status=None, limit=20, owner_id=None):
    # correlated subquery — นับเบาะแสในคำสั่งเดียว ไม่ยิง N+1 ต่อประกาศ
    sighting_count = (
        select(func.count(Sighting.id))
        .where(Sighting.report_id == LostReport.id)
        .correlate(LostReport)
        .scalar_subquery()
    )
    stmt = select(LostReport, Pet, sighting_count).join(Pet, Pet.id == LostReport.pet_id)
    if status:
        stmt = stmt.where(LostReport.status == status)
    elif owner_id is None:                       # ของตัวเอง (mine) เห็นทุกสถานะ รวมที่ปิดแล้ว
        stmt = stmt.where(LostReport.status.in_(OPEN_STATUSES))
    if owner_id is not None:
        stmt = stmt.where(LostReport.owner_id == owner_id)
    if species:
        stmt = stmt.where(Pet.species == species)
    if district:
        stmt = stmt.where(LostReport.district == district)
    return list(db.execute(stmt.order_by(LostReport.created_at.desc()).limit(limit)))


API_SETTABLE = (RESOLVED, SEARCHING)


def validate_transition(current: str, target: str) -> None:
    if target not in API_SETTABLE:
        raise AppError("INVALID_TRANSITION",
                       "สถานะ 'มีเบาะแส' ระบบตั้งให้อัตโนมัติเมื่อมีเบาะแสเข้ามา ตั้งเองไม่ได้")
    if target == current:
        raise AppError("INVALID_TRANSITION", "ประกาศอยู่ในสถานะนี้แล้ว")
    if target == RESOLVED and current not in OPEN_STATUSES:
        raise AppError("INVALID_TRANSITION", "ปิดประกาศที่ปิดอยู่แล้วไม่ได้")
    if target == SEARCHING and current != RESOLVED:
        raise AppError("INVALID_TRANSITION", "เปิดประกาศที่ยังไม่ได้ปิดไม่ได้")


def next_status_on_reopen(has_sightings: bool) -> str:
    return HAS_LEAD if has_sightings else SEARCHING


def change_status(db: Session, report_id: str, user: User, to: str, reason: str | None) -> LostReport:
    rid = get_report_or_404(db, report_id).id
    # ล็อกแถวก่อนอ่านสถานะ และถือล็อกจนถึง commit — แข่งกับ add_sighting ที่ล็อกแถวเดียวกัน
    report = db.execute(
        select(LostReport).where(LostReport.id == rid).with_for_update()
        .execution_options(populate_existing=True)   # ห้ามได้สถานะเก่าจาก Session cache
    ).scalar_one()

    if report.owner_id != user.id:
        db.rollback()
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์แก้ประกาศนี้")

    clean_reason = (reason or "").strip()
    try:
        validate_transition(report.status, to)
        if to == SEARCHING and not clean_reason:
            raise AppError("VALIDATION", "การเปิดประกาศใหม่ต้องระบุเหตุผล", field="reason")
    except AppError:
        db.rollback()                                # ปล่อยล็อก
        raise

    previous = report.status
    if to == RESOLVED:
        report.status = RESOLVED
        report.resolved_at = datetime.now(UTC)
    else:
        has_sightings = bool(db.scalar(select(func.count(Sighting.id)).where(Sighting.report_id == rid)))
        report.status = next_status_on_reopen(has_sightings)
        report.resolved_at = None

    event = ReportEvent(report_id=rid, actor_id=user.id, from_status=previous,
                        to_status=report.status, reason=clean_reason or None)
    db.add(event)
    db.flush()                                       # populate event.id for the notification dedupe key
    enqueue(db, "report.status_changed",
            {"report_id": str(rid), "from": previous, "to": report.status, "event_id": event.id})
    db.commit()
    return report
