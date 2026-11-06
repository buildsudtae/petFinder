import io

import pytest
from fastapi import UploadFile
from PIL import Image, PngImagePlugin

from app.errors import AppError
from app.storage import MAX_UPLOAD_BYTES, save_upload


def _image_bytes(fmt: str, size=(8, 8), **save_kwargs) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, "white").save(buf, fmt, **save_kwargs)
    return buf.getvalue()


PNG = _image_bytes("PNG")
GPS_IFD = 0x8825
ORIENTATION = 0x0112


def _upload(name: str, data: bytes, content_type: str) -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(data), headers={"content-type": content_type})


def test_accepts_png_and_returns_key(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    key = save_upload(_upload("a.png", PNG, "image/png"))
    assert key.endswith(".png")
    assert (tmp_path / key).exists()


def test_rejects_non_image_content_type(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    with pytest.raises(AppError) as e:
        save_upload(_upload("virus.sh", b"#!/bin/sh\nrm -rf /", "application/x-sh"))
    assert e.value.code == "VALIDATION"
    assert e.value.field == "photo"
    assert list(tmp_path.iterdir()) == []       # ไม่เขียนไฟล์ขยะลง volume


def test_rejects_file_over_limit(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    with pytest.raises(AppError) as e:
        save_upload(_upload("big.png", PNG + b"\x00" * (MAX_UPLOAD_BYTES + 1), "image/png"))
    assert e.value.field == "photo"
    assert list(tmp_path.iterdir()) == []


def test_rejects_image_content_type_with_non_image_bytes(tmp_path, monkeypatch):
    # content-type โกหกได้ — magic bytes คือตัวตัดสิน
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    with pytest.raises(AppError) as e:
        save_upload(_upload("fake.png", b"#!/bin/sh\nrm -rf /" + b"\x00" * 64, "image/png"))
    assert e.value.code == "VALIDATION"
    assert e.value.field == "photo"
    assert list(tmp_path.iterdir()) == []


def test_rejects_riff_container_that_is_not_webp(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    wav = b"RIFF" + bytes(4) + b"WAVE" + bytes(64)
    with pytest.raises(AppError) as e:
        save_upload(_upload("a.webp", wav, "image/webp"))
    assert e.value.field == "photo"
    assert list(tmp_path.iterdir()) == []


def test_accepts_real_webp_header(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    assert save_upload(_upload("a.webp", _image_bytes("WEBP"), "image/webp")).endswith(".webp")


def test_rejects_valid_header_with_undecodable_body(tmp_path, monkeypatch):
    # magic bytes ถูกแต่เนื้อไฟล์ไม่ใช่รูป — ต้องถอดรหัสไม่ผ่าน ไม่ใช่เก็บไว้เสิร์ฟ
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    with pytest.raises(AppError) as e:
        save_upload(_upload("a.png", bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 64, "image/png"))
    assert e.value.field == "photo"
    assert list(tmp_path.iterdir()) == []


def test_stored_jpeg_has_no_exif_gps(tmp_path, monkeypatch):
    # C3: มือถือฝังพิกัดที่ถ่ายไว้ใน EXIF และ /api/uploads เปิดให้ทุกคนโหลด — ไฟล์ที่เก็บต้องไม่มี EXIF เหลือ
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    exif = Image.Exif()
    exif[GPS_IFD] = {1: "N", 2: (13.0, 48.0, 0.0), 3: "E", 4: (100.0, 34.0, 0.0)}
    exif[0x010F] = "PhoneMaker"
    key = save_upload(_upload("a.jpg", _image_bytes("JPEG", exif=exif.tobytes()), "image/jpeg"))
    stored = (tmp_path / key).read_bytes()
    with Image.open(io.BytesIO(stored)) as im:
        assert dict(im.getexif()) == {}
        assert "exif" not in im.info
    assert b"Exif" not in stored


def test_stored_photo_is_rotated_upright_before_exif_is_dropped(tmp_path, monkeypatch):
    # orientation 6 = ต้องหมุน 90° — ทิ้ง EXIF โดยไม่หมุนก่อนจะได้รูปตะแคง
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    exif = Image.Exif()
    exif[ORIENTATION] = 6
    key = save_upload(_upload("a.jpg", _image_bytes("JPEG", size=(40, 20), exif=exif.tobytes()), "image/jpeg"))
    with Image.open(tmp_path / key) as im:
        assert im.size == (20, 40)
        assert ORIENTATION not in im.getexif()


def test_stored_png_drops_text_chunks(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    meta = PngImagePlugin.PngInfo()
    meta.add_text("Location", "13.80,100.57 home")
    key = save_upload(_upload("a.png", _image_bytes("PNG", pnginfo=meta), "image/png"))
    stored = (tmp_path / key).read_bytes()
    assert b"Location" not in stored and b"home" not in stored
