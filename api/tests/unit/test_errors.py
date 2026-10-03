import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.errors import AppError, install_error_handlers


def build_app() -> FastAPI:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/boom")
    def boom():
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์แก้ประกาศนี้", 403)

    return app


def test_app_error_shape_and_status():
    r = TestClient(build_app(), raise_server_exceptions=False).get("/boom")
    assert r.status_code == 403
    assert r.json() == {"code": "FORBIDDEN", "message_th": "คุณไม่มีสิทธิ์แก้ประกาศนี้", "field": None}


def test_unknown_code_is_rejected_at_construction():
    with pytest.raises(ValueError):
        AppError("NOT_A_REAL_CODE", "x", 400)
