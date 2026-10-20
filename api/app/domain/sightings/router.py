from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, Header, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.reports.service import get_report_or_404
from app.domain.sightings import service
from app.domain.sightings.models import Sighting
from app.domain.sightings.schemas import SightingList, SightingOut
from app.errors import AppError
from app.storage import delete_upload, save_upload

router = APIRouter(prefix="/api/reports", tags=["sightings"])


def _out(s: Sighting, finder_name: str) -> SightingOut:
    return SightingOut(
        id=str(s.id), finder_display_name=finder_name,
        photo_url=f"/api/uploads/{s.photo_key}" if s.photo_key else None,
        thumb_url=f"/api/uploads/{s.thumb_key}" if s.thumb_key else None,
        seen_at=s.seen_at, district=s.district, area_note=s.area_note,
        note=s.note, created_at=s.created_at,
    )


@router.post("/{report_id}/sightings", response_model=SightingOut)
def create(
    report_id: str,
    response: Response,
    seen_at: datetime = Form(...),
    district: str = Form(..., min_length=1, max_length=80),
    area_note: str | None = Form(default=None, max_length=200),
    note: str | None = Form(default=None, max_length=1000),
    photo: UploadFile | None = File(default=None),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_session),
    finder: User = Depends(current_user),
):
    if not idempotency_key or not idempotency_key.strip():
        raise AppError("VALIDATION",
                       "คำขอนี้ต้องมี Idempotency-Key เพื่อกันการส่งเบาะแสซ้ำ",
                       field="Idempotency-Key")
    if len(idempotency_key.strip()) > 100:       # คอลัมน์ idem_key เป็น String(100)
        raise AppError("VALIDATION", "Idempotency-Key ต้องยาวไม่เกิน 100 ตัวอักษร",
                       field="Idempotency-Key")
    if seen_at.tzinfo is None:
        seen_at = seen_at.replace(tzinfo=UTC)
    if seen_at > datetime.now(UTC):
        raise AppError("VALIDATION", "เวลาที่พบต้องไม่เป็นเวลาในอนาคต", field="seen_at")
    if not district.strip():
        raise AppError("VALIDATION", "กรุณาระบุเขตหรือบริเวณที่พบ", field="district")

    # ไฟล์ต้องมีอายุเท่าแถว: เก็บไว้เฉพาะเมื่อสร้าง sighting ใหม่สำเร็จ
    # ทุกทางอื่น (404/409/422, replay 200, exception) ลบทิ้ง ไม่งั้น volume เต็มได้
    photo_key = None
    created = False
    try:
        photo_key = save_upload(photo) if photo is not None and photo.filename else None
        sighting, created = service.add_sighting(
            db, report_id, finder, idempotency_key.strip(), photo_key,
            seen_at=seen_at, district=district.strip(),
            area_note=(area_note or None), note=(note or None),
        )
    finally:
        if photo_key is not None and not created:
            delete_upload(photo_key)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return _out(sighting, finder.display_name)


@router.get("/{report_id}/sightings", response_model=SightingList)
def timeline(report_id: str, db: Session = Depends(get_session)):
    report = get_report_or_404(db, report_id)
    rows = db.execute(
        select(Sighting, User.display_name)
        .join(User, User.id == Sighting.finder_id)
        .where(Sighting.report_id == report.id)
        .order_by(Sighting.created_at)
    ).all()
    return SightingList(items=[_out(s, name) for s, name in rows])
