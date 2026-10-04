import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, text

from app.config import DEFAULT_JWT_SECRET, get_settings
from app.domain.auth.router import router as auth_router
from app.domain.pets.router import router as pets_router
from app.domain.reports.router import router as reports_router
from app.domain.relay.router import router as relay_router
from app.domain.sightings.router import router as sightings_router
from app.errors import AppError, install_error_handlers
from app.storage import upload_dir

def assert_safe_secret() -> None:
    if get_settings().jwt_secret == DEFAULT_JWT_SECRET and os.environ.get("PETTECH_ALLOW_DEV_SECRET") != "1":
        raise RuntimeError(
            "JWT_SECRET is unset or the public default; set a real secret "
            "(or PETTECH_ALLOW_DEV_SECRET=1 for local development only)"
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    assert_safe_secret()
    yield


app = FastAPI(
    title="Lost Pet Finder API", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan
)
install_error_handlers(app)
app.include_router(auth_router)
app.include_router(pets_router)
app.include_router(reports_router)
app.include_router(sightings_router)
app.include_router(relay_router)


@app.get("/api/uploads/{key}")
def serve_upload(key: str):
    if "/" in key or "\\" in key or ".." in key:        # กัน path traversal
        raise AppError("NOT_FOUND", "ไม่พบไฟล์")
    root = upload_dir().resolve()
    path = (root / key).resolve()
    if root not in path.parents or not path.is_file():  # กันอีกชั้นเผื่อ symlink
        raise AppError("NOT_FOUND", "ไม่พบไฟล์")
    return FileResponse(path)


@app.get("/api/health")
def health():
    s = get_settings()
    return {"status": "ok", "version": s.app_version, "commit": s.git_commit, "build": s.build_number}


def _check_db(url: str) -> bool:
    try:
        engine = create_engine(url, pool_pre_ping=True)
        try:
            with engine.connect() as conn:
                conn.execute(text("select 1"))
        finally:
            engine.dispose()
        return True
    except Exception:
        return False


def _check_broker(url: str) -> bool:
    import kombu
    try:
        with kombu.Connection(url, connect_timeout=1) as conn:
            conn.connect()
        return True
    except Exception:
        return False


@app.get("/api/ready")
def ready():
    s = get_settings()
    db_ok = _check_db(s.database_url)
    broker_ok = _check_broker(s.rabbitmq_url)
    # degraded ไม่ใช่ error: API ยังรับคำขอได้เมื่อ broker ล่ม งาน async ค้างใน outbox
    return {"status": "ok" if db_ok and broker_ok else "degraded", "db": db_ok, "broker": broker_ok}
