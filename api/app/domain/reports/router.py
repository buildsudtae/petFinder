from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user, optional_user
from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.domain.pets.schemas import Species
from app.domain.reports import service
from app.domain.reports.models import ReportEvent
from app.domain.reports.schemas import (
    EventList, EventOut, ReportIn, ReportList, ReportOut, StatusFilter, StatusIn,
)
from app.domain.sightings import service as sightings_service
from app.errors import AppError

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _out(report, pet: Pet, sighting_count: int, viewer: User | None = None) -> ReportOut:
    return ReportOut(
        id=str(report.id), status=report.status, pet_name=pet.name, species=pet.species,
        color=pet.color, marks=pet.marks, last_seen_at=report.last_seen_at,
        district=report.district, area_note=report.area_note, description=report.description,
        sighting_count=sighting_count, created_at=report.created_at,
        is_owner=viewer is not None and report.owner_id == viewer.id,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ReportOut)
def create(payload: ReportIn, db: Session = Depends(get_session), user: User = Depends(current_user)):
    data = payload.model_dump()
    pet_id = data.pop("pet_id")
    report = service.create_report(db, user, pet_id, **data)
    # ประกาศที่เพิ่งสร้างยังไม่มีเบาะแสแน่นอน จึงไม่ต้องยิง query นับ
    return _out(report, db.get(Pet, report.pet_id), 0, user)


@router.get("", response_model=ReportList)
def search(
    species: Species | None = None,
    district: str | None = Query(default=None, max_length=80),
    status: StatusFilter | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    mine: bool = False,
    db: Session = Depends(get_session),
    viewer: User | None = Depends(optional_user),
):
    if mine and viewer is None:
        raise AppError("AUTH_REQUIRED", "กรุณาเข้าสู่ระบบก่อนใช้งาน")
    rows = service.search(db, species=species, district=district, status=status, limit=limit,
                          owner_id=viewer.id if mine else None)
    return ReportList(items=[_out(r, p, n, viewer) for r, p, n in rows])


@router.patch("/{report_id}/status", response_model=ReportOut)
def change_status(report_id: str, payload: StatusIn, db: Session = Depends(get_session),
                  user: User = Depends(current_user)):
    report = service.change_status(db, report_id, user, payload.to, payload.reason)
    pet = db.get(Pet, report.pet_id)
    return _out(report, pet, sightings_service.count_for_report(db, report.id), user)


@router.get("/{report_id}/events", response_model=EventList)
def events(report_id: str, db: Session = Depends(get_session), user: User = Depends(current_user)):
    # owner only: the reopen reason is free text and may name third parties (401 anonymous, 403 others)
    report = service.get_report_or_404(db, report_id)
    if report.owner_id != user.id:
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์ดูประวัติสถานะของประกาศนี้")
    rows = db.scalars(
        select(ReportEvent).where(ReportEvent.report_id == report.id).order_by(ReportEvent.id)
    )
    return EventList(items=[EventOut(from_status=e.from_status, to_status=e.to_status,
                                     reason=e.reason, created_at=e.created_at) for e in rows])


@router.get("/{report_id}", response_model=ReportOut)
def detail(report_id: str, db: Session = Depends(get_session), viewer: User | None = Depends(optional_user)):
    report = service.get_report_or_404(db, report_id)
    pet = db.get(Pet, report.pet_id)
    return _out(report, pet, sightings_service.count_for_report(db, report.id), viewer)
