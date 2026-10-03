from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.domain.pets.schemas import Species
from app.domain.reports import service
from app.domain.reports.schemas import ReportIn, ReportList, ReportOut, StatusFilter
from app.domain.sightings import service as sightings_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _out(report, pet: Pet, sighting_count: int) -> ReportOut:
    return ReportOut(
        id=str(report.id), status=report.status, pet_name=pet.name, species=pet.species,
        color=pet.color, marks=pet.marks, last_seen_at=report.last_seen_at,
        district=report.district, area_note=report.area_note, description=report.description,
        sighting_count=sighting_count, created_at=report.created_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ReportOut)
def create(payload: ReportIn, db: Session = Depends(get_session), user: User = Depends(current_user)):
    data = payload.model_dump()
    pet_id = data.pop("pet_id")
    report = service.create_report(db, user, pet_id, **data)
    # ประกาศที่เพิ่งสร้างยังไม่มีเบาะแสแน่นอน จึงไม่ต้องยิง query นับ
    return _out(report, db.get(Pet, report.pet_id), 0)


@router.get("", response_model=ReportList)
def search(
    species: Species | None = None,
    district: str | None = Query(default=None, max_length=80),
    status: StatusFilter | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_session),
):
    rows = service.search(db, species=species, district=district, status=status, limit=limit)
    return ReportList(items=[_out(r, p, n) for r, p, n in rows])


@router.get("/{report_id}", response_model=ReportOut)
def detail(report_id: str, db: Session = Depends(get_session)):
    report = service.get_report_or_404(db, report_id)
    pet = db.get(Pet, report.pet_id)
    return _out(report, pet, sightings_service.count_for_report(db, report.id))
