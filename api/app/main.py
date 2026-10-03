import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import create_engine, text

from app.config import DEFAULT_JWT_SECRET, get_settings
from app.domain.auth.router import router as auth_router
from app.domain.pets.router import router as pets_router
from app.domain.reports.router import router as reports_router
from app.errors import install_error_handlers

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


@app.get("/api/health")
def health():
    s = get_settings()
    return {"status": "ok", "version": s.app_version, "commit": s.git_commit, "build": s.build_number}


@app.get("/api/ready")
def ready():
    s = get_settings()
    db_ok = False
    try:
        engine = create_engine(s.database_url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("select 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "db": db_ok, "broker": True}
