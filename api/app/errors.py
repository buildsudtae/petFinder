import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

ALLOWED_CODES = {
    "REPORT_CLOSED": 409,
    "FORBIDDEN": 403,
    "VALIDATION": 422,
    "NOT_FOUND": 404,
    "AUTH_REQUIRED": 401,
    "INVALID_TRANSITION": 409,
    "INTERNAL": 500,
}


class AppError(Exception):
    def __init__(self, code: str, message_th: str, status: int | None = None, field: str | None = None):
        if code not in ALLOWED_CODES:
            raise ValueError(f"code ไม่อยู่ใน contract: {code}")
        self.code = code
        self.message_th = message_th
        self.status = status or ALLOWED_CODES[code]
        self.field = field
        super().__init__(message_th)


_HTTP_DEFAULT = ("VALIDATION", "คำขอไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง")
_HTTP_MAP = {
    404: ("NOT_FOUND", "ไม่พบข้อมูลหรือหน้าที่ต้องการ"),
    405: ("VALIDATION", "ไม่รองรับวิธีการเรียกใช้งานนี้"),
    401: ("AUTH_REQUIRED", "กรุณาเข้าสู่ระบบก่อนใช้งาน"),
    403: ("FORBIDDEN", "คุณไม่มีสิทธิ์ทำรายการนี้"),
}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status,
            content={"code": exc.code, "message_th": exc.message_th, "field": exc.field},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        loc = [p for p in first.get("loc", []) if p not in ("body", "query", "header")]
        return JSONResponse(
            status_code=422,
            content={
                "code": "VALIDATION",
                "message_th": "ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
                "field": str(loc[0]) if loc else None,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code, message = _HTTP_MAP.get(exc.status_code, _HTTP_DEFAULT)
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": code, "message_th": message, "field": None},
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        logger.exception("unhandled exception", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={
                "code": "INTERNAL",
                "message_th": "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง",
                "field": None,
            },
        )
