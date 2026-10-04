import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.reports.models import HAS_LEAD, RESOLVED, SEARCHING, LostReport, ReportEvent
from app.domain.sightings.models import Sighting
from app.errors import AppError
from app.outbox import enqueue


def add_sighting(db: Session, report_id: str, finder: User, idem_key: str,
                 photo_key: str | None, **fields) -> tuple[Sighting, bool]:
    try:
        rid = uuid.UUID(report_id)
    except ValueError:
        raise AppError("NOT_FOUND", "ไม่พบประกาศที่ระบุ")

    # I1 — ล็อกแถวประกาศไว้ตลอด transaction: การเช็คสถานะกับการ insert ต้องอยู่ใน
    # transaction เดียวกัน ไม่งั้นเจ้าของปิดประกาศพร้อมกันจะได้เบาะแสติดประกาศที่ปิดแล้ว
    report = db.execute(
        select(LostReport).where(LostReport.id == rid).with_for_update()
        .execution_options(populate_existing=True)   # ห้ามได้สถานะเก่าจาก Session cache
    ).scalar_one_or_none()
    if report is None:
        raise AppError("NOT_FOUND", "ไม่พบประกาศที่ระบุ")
    if report.owner_id == finder.id:
        raise AppError("VALIDATION",
                       "ส่งเบาะแสเข้าประกาศของตัวเองไม่ได้ ถ้าพบสัตว์แล้วให้กดปิดประกาศ")
    if report.status == RESOLVED:
        db.rollback()
        raise AppError("REPORT_CLOSED",
                       "เจ้าของพบสัตว์แล้ว ประกาศนี้ปิดรับเบาะแส")

    sighting = Sighting(report_id=rid, finder_id=finder.id, idem_key=idem_key,
                        photo_key=photo_key, **fields)
    db.add(sighting)
    try:
        db.flush()
    except IntegrityError as e:
        # I2 — การส่งซ้ำด้วย Idempotency-Key เดิมชน uq_sightings_idem แล้วคืนแถวเดิม
        db.rollback()
        # เป็น replay ก็ต่อเมื่อ 23505 บน uq_sightings_idem; ถ้า driver ไม่บอก (None) ใช้พฤติกรรมเดิม
        sqlstate = getattr(e.orig, "sqlstate", None)
        constraint = getattr(getattr(e.orig, "diag", None), "constraint_name", None)
        if (sqlstate is not None and sqlstate != "23505") or (
            constraint is not None and constraint != "uq_sightings_idem"
        ):
            raise
        existing = db.scalar(
            select(Sighting).where(
                Sighting.report_id == rid,
                Sighting.finder_id == finder.id,
                Sighting.idem_key == idem_key,
            )
        )
        if existing is None:
            raise                      # ไม่ใช่การชน idem_key — ห้ามกลืน error
        return existing, False

    if report.status == SEARCHING:
        report.status = HAS_LEAD
        db.add(ReportEvent(report_id=rid, actor_id=None, from_status=SEARCHING, to_status=HAS_LEAD,
                           reason="ระบบตั้งอัตโนมัติเมื่อมีเบาะแสแรก"))

    enqueue(db, "sighting.created", {"sighting_id": str(sighting.id), "report_id": str(rid)})
    db.commit()
    return sighting, True


def count_for_report(db: Session, report_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count(Sighting.id)).where(Sighting.report_id == report_id)
    ) or 0
