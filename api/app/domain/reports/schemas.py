from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ReportIn(BaseModel):
    pet_id: str
    last_seen_at: datetime
    district: str = Field(min_length=1, max_length=80)
    area_note: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("last_seen_at")
    @classmethod
    def not_in_future(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            v = v.replace(tzinfo=UTC)
        if v > datetime.now(UTC):
            raise ValueError("เวลาที่พบครั้งสุดท้ายต้องไม่เป็นเวลาในอนาคต")
        return v

    @field_validator("district", "area_note", "description")
    @classmethod
    def not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("ห้ามเว้นว่าง")
        return v.strip() if v else v


class ReportOut(BaseModel):
    id: str
    status: str
    pet_name: str
    species: str
    color: str | None
    marks: str | None
    last_seen_at: datetime
    district: str
    area_note: str | None
    description: str | None
    sighting_count: int
    created_at: datetime


class ReportList(BaseModel):
    items: list[ReportOut]
    next_cursor: str | None = None


StatusFilter = Literal["SEARCHING", "HAS_LEAD", "RESOLVED"]
