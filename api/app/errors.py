from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

ALLOWED_CODES = {
    "REPORT_CLOSED": 409,
    "FORBIDDEN": 403,
    "VALIDATION": 422,
    "NOT_FOUND": 404,
    "AUTH_REQUIRED": 401,
    "INVALID_TRANSITION": 409,
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
