from datetime import datetime

from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    """ไม่คืน payload ดิบ — เลือกเฉพาะ field ที่หน้าเว็บใช้ ไม่มี id ผู้ใช้หรือข้อมูลติดต่อ"""

    id: int
    topic: str                       # sighting.created | report.status_changed
    report_id: str | None
    status_to: str | None            # มีเฉพาะ report.status_changed
    created_at: datetime
    read: bool


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread_count: int


class MarkReadIn(BaseModel):
    report_id: str | None = Field(default=None, max_length=36)   # ไม่ระบุ = อ่านทั้งหมด
