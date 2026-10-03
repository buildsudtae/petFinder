import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import get_settings
from app.errors import AppError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAGIC = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"RIFF": "image/webp",
}


def _upload_dir() -> Path:
    path = Path(os.environ.get("UPLOAD_DIR") or get_settings().upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _reject(message: str) -> None:
    raise AppError("VALIDATION", message, field="photo")


def save_upload(file: UploadFile) -> str:
    if file.content_type not in ALLOWED:
        _reject("รับเฉพาะไฟล์รูปภาพ PNG, JPEG หรือ WebP")

    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        _reject("ไฟล์รูปต้องมีขนาดไม่เกิน 5 MB")
    if not any(data.startswith(sig) for sig in MAGIC):
        _reject("ไฟล์นี้ไม่ใช่รูปภาพที่อ่านได้")   # content-type โกหกได้ จึงเช็ค magic bytes ด้วย

    key = f"{uuid.uuid4().hex}{ALLOWED[file.content_type]}"
    (_upload_dir() / key).write_bytes(data)
    return key
