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


def test_unknown_route_uses_error_contract():
    r = TestClient(build_app(), raise_server_exceptions=False).get("/api/nope")
    assert r.status_code == 404
    body = r.json()
    assert set(body) == {"code", "message_th", "field"}
    assert body["code"] == "NOT_FOUND"
    assert body["field"] is None


def test_wrong_method_uses_error_contract():
    r = TestClient(build_app(), raise_server_exceptions=False).post("/boom")
    assert r.status_code == 405
    body = r.json()
    assert set(body) == {"code", "message_th", "field"}
    assert body["code"] == "VALIDATION"


def test_unhandled_exception_is_500_internal_without_leaking_text():
    app = build_app()

    @app.get("/crash")
    def crash():
        raise RuntimeError("secret-internal-detail")

    r = TestClient(app, raise_server_exceptions=False).get("/crash")
    assert r.status_code == 500
    assert r.json() == {
        "code": "INTERNAL",
        "message_th": "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง",
        "field": None,
    }
    assert "secret-internal-detail" not in r.text


def test_internal_code_is_constructible():
    assert AppError("INTERNAL", "x").status == 500
