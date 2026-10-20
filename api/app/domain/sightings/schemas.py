from datetime import datetime

from pydantic import BaseModel


class SightingOut(BaseModel):
    """ผู้พบเห็นเปิดเผยแค่ชื่อที่แสดง — ข้อมูลติดต่อห้ามโผล่ใน timeline (I6)"""

    id: str
    finder_display_name: str
    photo_url: str | None
    thumb_url: str | None
    seen_at: datetime
    district: str
    area_note: str | None
    note: str | None
    created_at: datetime


class SightingList(BaseModel):
    items: list[SightingOut]
