import io

import pytest
from fastapi import UploadFile

from app.errors import AppError
from app.storage import MAX_UPLOAD_BYTES, save_upload

PNG = bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 64


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
