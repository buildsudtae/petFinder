from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator

# บริเวณที่หายเก็บแค่ทศนิยม 3 ตำแหน่ง (≈ 100 ม.) — ไม่ชี้บ้านหลังไหน และต้องอยู่ในกรอบ กทม.
AREA_DECIMALS = 3
LAT_RANGE = (13.45, 14.05)
LNG_RANGE = (100.2, 101.0)


class ReportIn(BaseModel):
    pet_id: str
    last_seen_at: datetime
    district: str = Field(min_length=1, max_length=80)
    area_note: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    area_lat: float | None = Field(default=None, ge=LAT_RANGE[0], le=LAT_RANGE[1])
    area_lng: float | None = Field(default=None, ge=LNG_RANGE[0], le=LNG_RANGE[1], validate_default=True)

    @field_validator("area_lat")
    @classmethod
    def round_lat(cls, v: float | None) -> float | None:
        return None if v is None else round(v, AREA_DECIMALS)

    @field_validator("area_lng")
    @classmethod
    def round_lng_and_pair(cls, v: float | None, info: ValidationInfo) -> float | None:
        if (v is None) != (info.data.get("area_lat") is None):
            raise ValueError("ต้องส่งทั้งละติจูดและลองจิจูด หรือไม่ส่งทั้งคู่")
        return None if v is None else round(v, AREA_DECIMALS)

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
    photo_url: str | None = None      # รูปปัจจุบันของสัตว์ตัวนี้
    last_seen_at: datetime
    district: str
    area_note: str | None
    description: str | None
    sighting_count: int
    is_owner: bool = False   # about the caller only; owner_id is never exposed
    created_at: datetime
    resolved_at: datetime | None = None   # วันที่เจ้าของปิดว่าพบแล้ว (เหตุผลยังอยู่ใน /events เฉพาะเจ้าของ)


class ReportDetailOut(ReportOut):
    # บริเวณโดยประมาณอยู่เฉพาะหน้าประกาศ ไม่อยู่ในรายการ — ไม่ให้ดึงพิกัดของทุกประกาศได้ในคำขอเดียว
    area_lat: float | None = None
    area_lng: float | None = None


class ReportList(BaseModel):
    items: list[ReportOut]
    next_cursor: str | None = None


StatusFilter = Literal["SEARCHING", "HAS_LEAD", "RESOLVED"]


class StatusIn(BaseModel):
    to: Literal["RESOLVED", "SEARCHING", "HAS_LEAD"]
    reason: str | None = Field(default=None, max_length=300)


class EventOut(BaseModel):
    from_status: str | None
    to_status: str
    reason: str | None
    created_at: datetime


class EventList(BaseModel):
    items: list[EventOut]
