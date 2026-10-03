from fastapi import FastAPI
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.domain.auth.router import router as auth_router
from app.errors import install_error_handlers

app = FastAPI(title="Lost Pet Finder API", docs_url="/api/docs", openapi_url="/api/openapi.json")
install_error_handlers(app)
app.include_router(auth_router)


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
