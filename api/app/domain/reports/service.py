import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.domain.pets.service import get_owned_pet
from app.domain.reports.models import OPEN_STATUSES, SEARCHING, LostReport, ReportEvent
from app.errors import AppError


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


def search(db: Session, species=None, district=None, status=None, limit=20):
    stmt = select(LostReport, Pet).join(Pet, Pet.id == LostReport.pet_id)
    stmt = stmt.where(LostReport.status == status) if status else stmt.where(LostReport.status.in_(OPEN_STATUSES))
    if species:
        stmt = stmt.where(Pet.species == species)
    if district:
        stmt = stmt.where(LostReport.district == district)
    return list(db.execute(stmt.order_by(LostReport.created_at.desc()).limit(limit)))
