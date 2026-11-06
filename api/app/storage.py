import io
import os
import uuid
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps

from app.config import get_settings
from app.errors import AppError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
PIL_FORMAT = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}
MAGIC = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"RIFF": "image/webp",
}


def upload_dir() -> Path:
    """โฟลเดอร์ปลายทาง — env ชนะ config เพื่อให้ test ชี้ไป tmp_path ได้
    main.serve_upload ใช้ตัวเดียวกัน เขียนกับอ่านจึงไม่หลุดไปคนละที่"""
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
    if not any(data.startswith(sig) for sig in MAGIC) or (
        data.startswith(b"RIFF") and data[8:12] != b"WEBP"   # RIFF ยังเป็น WAV/AVI ได้
    ):
        _reject("ไฟล์นี้ไม่ใช่รูปภาพที่อ่านได้")   # content-type โกหกได้ จึงเช็ค magic bytes ด้วย

    clean = _without_metadata(data, file.content_type)
    key = f"{uuid.uuid4().hex}{ALLOWED[file.content_type]}"
    (upload_dir() / key).write_bytes(clean)
    return key


def _without_metadata(data: bytes, content_type: str) -> bytes:
    """เข้ารหัสรูปใหม่โดยไม่พก EXIF/XMP/text chunk — มือถือฝังพิกัด GPS ไว้ในรูป และ /api/uploads เปิดให้ทุกคนโหลด (C3)
    หมุนรูปตาม EXIF orientation ก่อนทิ้ง ไม่งั้นรูปจากมือถือจะตะแคง"""
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()                              # ถอดรหัสจริง: header ถูกแต่เนื้อไฟล์พังต้องไม่ผ่าน
            upright = ImageOps.exif_transpose(im)
    except Exception:                              # UnidentifiedImageError, OSError, DecompressionBombError
        _reject("ไฟล์นี้ไม่ใช่รูปภาพที่อ่านได้")
    upright.info.clear()                           # save() ของบาง format หยิบ exif/icc จาก info มาเขียนต่อ
    fmt = PIL_FORMAT[content_type]
    if fmt == "JPEG" and upright.mode not in ("RGB", "L"):
        upright = upright.convert("RGB")
    out = io.BytesIO()
    upright.save(out, fmt, **({"quality": 90} if fmt in ("JPEG", "WEBP") else {}))
    return out.getvalue()


def delete_upload(key: str) -> None:
    """ลบไฟล์ที่เพิ่งบันทึก — ใช้เมื่อ request จบโดยไม่ได้สร้างแถว sighting ใหม่"""
    (upload_dir() / key).unlink(missing_ok=True)
