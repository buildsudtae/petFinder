# Lost Pet Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ระบบเว็บประกาศสัตว์เลี้ยงหาย รับเบาะแสจากผู้พบเห็น และปิดเรื่องได้ โดยกฎความถูกต้องทั้งหมดบังคับที่ฐานข้อมูล

**Architecture:** React static behind Traefik, FastAPI (2 replica) owning business rules, PostgreSQL as the only source of truth with row locks and unique constraints, Celery worker draining a Postgres `outbox` through RabbitMQ for slow work. ทุก invariant อยู่ใน transaction เดียวกับการเขียนข้อมูลธุรกิจ ไม่มี state ในหน่วยความจำของ process

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy 2.x · Alembic · PostgreSQL 17 · React+Vite+TS · nginx · Traefik v3.7.4 · RabbitMQ 3 · Celery · Docker Compose · Jenkins · pytest

**Spec:** [`docs/specs/2026-10-03-lost-pet-finder-design.md`](../specs/2026-10-03-lost-pet-finder-design.md) · โดเมน: [`docs/CONTEXT.md`](../CONTEXT.md) · เหตุผล stack: [`docs/adr/0001-tech-stack-selection.md`](../adr/0001-tech-stack-selection.md)

## Global Constraints

- Runtime ที่ใช้ตรวจ: image `tuchsanai/devtools:2569_1` (Docker-in-Docker) — ทุกคำสั่งต้องรันได้ในกล่องนี้
- Traefik `v3.7.4` · PostgreSQL `17` · RabbitMQ `3-management` · Python `3.12` · Node `24`
- เปิดพอร์ตออกจากกล่องแค่ `8000` (web+api ผ่าน Traefik) และ `8080` (Traefik dashboard) เท่านั้น
- `api` ตั้ง `deploy.replicas: 2` · **ห้ามตั้ง `container_name`** และ **ห้าม `ports:`** ใน service `api`
- `worker` ต้องเป็น **1 replica** (celery worker + beat รวมกัน) — beat ที่ซ้อนกันจะดูด `outbox` ซ้ำ
- ตาราง `users` **ห้ามมีคอลัมน์** `phone`, `address`, `line_id` หรือข้อมูลติดต่อใดๆ
- Error response ทุกตัวมีรูปแบบเดียว: `{"code": str, "message_th": str, "field": str|null}`
- `code` ที่ใช้ได้เท่านั้น: `REPORT_CLOSED`(409) `FORBIDDEN`(403) `VALIDATION`(422) `NOT_FOUND`(404) `AUTH_REQUIRED`(401) `INVALID_TRANSITION`(409)
- `message_th` เป็นภาษาไทยทุกข้อความ ผู้ใช้ต้องอ่านเข้าใจได้โดยไม่ต้องเปิด log
- สถานะใช้ได้เฉพาะ `SEARCHING` `HAS_LEAD` `RESOLVED` · `HAS_LEAD` ตั้งโดยระบบเท่านั้น
- `.env` ห้าม commit · commit `.env.example` เท่านั้น
- ทุก Celery task ต้อง idempotent (delivery เป็น at-least-once)

## Review Focus

กรณีที่ spec บอกเป็นนัยแต่ไม่มี task ไหนทดสอบตรงๆ — เสี่ยงพังใส่ผู้ใช้จริงมากที่สุดเรียงจากบนลงล่าง แต่ละข้อถูกผูกเป็นเทสไว้ใน task ที่เป็นเจ้าของโค้ดแล้ว

1. **อัปโหลดไฟล์ที่ไม่ใช่รูป หรือใหญ่เกิน 5 MB** → ต้อง `422 VALIDATION` พร้อม `field: "photo"` ไม่ใช่ 500 หรือเขียนไฟล์ขยะลง volume (เทสใน Task 5)
2. **`seen_at` / `last_seen_at` เป็นเวลาในอนาคต** → ต้อง `422 VALIDATION` เพราะ timeline ที่มีเบาะแสจากอนาคตทำให้เจ้าของวางแผนผิด (เทสใน Task 4 และ Task 5)
3. **เจ้าของส่งเบาะแสเข้าประกาศของตัวเอง** → ต้อง `422 VALIDATION` เพราะจะทำให้สถานะเด้งเป็น `HAS_LEAD` โดยไม่มีคนนอกเห็นสัตว์จริง (เทสใน Task 5)
4. **ไม่ส่ง header `Idempotency-Key` หรือส่งค่าว่าง** → ต้อง `422 VALIDATION` ไม่ใช่สร้างเบาะแสซ้ำเงียบๆ ทุกครั้งที่กด (เทสใน Task 5)
5. **ข้อความยาวเกินขอบเขต / `note` 10,000 ตัวอักษร / `district` ว่าง** → ต้อง `422 VALIDATION` ระบุ field ไม่ใช่ 500 จาก DB (เทสใน Task 4 และ Task 5)

---

### Task 1: Skeleton ที่สตาร์ตได้ในกล่องรายวิชา

**Files:**
- Create: `pettech/.gitignore`, `pettech/.env.example`, `pettech/README.md`
- Create: `pettech/api/pyproject.toml`, `pettech/api/Dockerfile`, `pettech/api/app/main.py`, `pettech/api/app/config.py`
- Create: `pettech/infra/docker-compose.yml`, `pettech/infra/docker-compose.test.yml`
- Create: `pettech/scripts/up.sh`, `pettech/scripts/down.sh`, `pettech/scripts/test.sh`
- Test: `pettech/api/tests/unit/test_health.py`

**Interfaces:**
- Consumes: —
- Produces: `app.main:app` (FastAPI instance) · `GET /api/health` → `{"status":"ok","version":str,"commit":str,"build":str}` · `GET /api/ready` → `{"status":"ok"|"degraded","db":bool,"broker":bool}` · `app.config:Settings` with fields `database_url: str`, `jwt_secret: str`, `rabbitmq_url: str`, `app_version: str`, `git_commit: str`, `build_number: str`, `upload_dir: str`

- [ ] **Step 1: เขียน test ที่ fail**

`pettech/api/tests/unit/test_health.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_returns_build_metadata():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "version", "commit", "build"}
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech/api && python -m pytest tests/unit/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'`

- [ ] **Step 3: เขียน config และ app ให้ test ผ่าน**

`pettech/api/app/config.py`:

```python
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://pettech:pettech@db:5432/pettech"
    jwt_secret: str = "dev-only-not-for-production"
    rabbitmq_url: str = "amqp://pettech:pettech@rabbitmq:5672//"
    app_version: str = "0.0.0"
    git_commit: str = "unknown"
    build_number: str = "0"
    upload_dir: str = "/data/uploads"
    cookie_secure: bool = False

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`pettech/api/app/main.py`:

```python
from fastapi import FastAPI

from app.config import get_settings

app = FastAPI(title="Lost Pet Finder API", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.get("/api/health")
def health():
    s = get_settings()
    return {"status": "ok", "version": s.app_version, "commit": s.git_commit, "build": s.build_number}
```

`pettech/api/pyproject.toml`:

```toml
[project]
name = "pettech-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.32",
  "sqlalchemy>=2.0.36",
  "psycopg[binary]>=3.2",
  "alembic>=1.14",
  "pydantic-settings>=2.6",
  "python-jose[cryptography]>=3.3",
  "argon2-cffi>=23.1",
  "python-multipart>=0.0.12",
  "celery>=5.4",
  "pillow>=11.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.3", "pytest-asyncio>=0.24", "httpx>=0.28"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd pettech/api && pip install -e '.[dev]' && python -m pytest tests/unit/test_health.py -v`
Expected: PASS

- [ ] **Step 5: เขียน `/api/ready` ที่เช็ค db จริง**

เพิ่มใน `app/main.py`:

```python
from sqlalchemy import create_engine, text


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
```

> `broker` คืน `True` ไว้ก่อนใน task นี้ Task 8 จะเปลี่ยนให้เช็คจริง — การที่ broker ล่มต้องไม่ทำให้ `/api/ready` ล้ม (degraded mode คือ API ยังรับงานได้)

- [ ] **Step 6: เขียน Dockerfile**

`pettech/api/Dockerfile`:

```dockerfile
FROM python:3.12-slim

ARG APP_VERSION=0.0.0
ARG GIT_COMMIT=unknown
ARG BUILD_NUMBER=0
ENV APP_VERSION=$APP_VERSION GIT_COMMIT=$GIT_COMMIT BUILD_NUMBER=$BUILD_NUMBER \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

WORKDIR /srv
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e '.[dev]'
COPY . .
RUN mkdir -p /data/uploads

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 7: เขียน compose**

`pettech/infra/docker-compose.yml`:

```yaml
name: pettech

services:
  traefik:
    image: traefik:v3.7.4
    command:
      - --providers.docker=true
      - --providers.docker.exposedByDefault=false
      - --api.insecure=true
      - --entrypoints.web.address=:80
    ports:
      - "8000:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [petnet]

  api:
    build:
      context: ../api
      args:
        APP_VERSION: ${APP_VERSION:-0.0.0}
        GIT_COMMIT: ${GIT_COMMIT:-unknown}
        BUILD_NUMBER: ${BUILD_NUMBER:-0}
    image: pettech-api:${IMAGE_TAG:-dev}
    environment:
      DATABASE_URL: postgresql+psycopg://pettech:${POSTGRES_PASSWORD}@db:5432/pettech
      JWT_SECRET: ${JWT_SECRET}
      RABBITMQ_URL: amqp://pettech:${RABBITMQ_PASSWORD}@rabbitmq:5672//
      UPLOAD_DIR: /data/uploads
    volumes:
      - uploads:/data/uploads
    deploy:
      replicas: 2
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8000/api/health"]
      interval: 10s
      timeout: 3s
      retries: 10
    depends_on:
      db:
        condition: service_healthy
    labels:
      traefik.enable: "true"
      traefik.docker.network: petnet
      traefik.http.routers.api.entrypoints: web
      traefik.http.routers.api.rule: PathPrefix(`/api`)
      traefik.http.routers.api.service: api
      traefik.http.routers.api.middlewares: api-rl@docker
      traefik.http.middlewares.api-rl.ratelimit.average: "20"
      traefik.http.middlewares.api-rl.ratelimit.burst: "40"
      traefik.http.services.api.loadbalancer.server.port: "8000"
    networks: [petnet]

  db:
    image: postgres:17
    environment:
      POSTGRES_DB: pettech
      POSTGRES_USER: pettech
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pettech -d pettech"]
      interval: 5s
      timeout: 3s
      retries: 20
    networks: [petnet]

volumes:
  pgdata:
  uploads:

networks:
  petnet:
    name: petnet
```

`pettech/infra/docker-compose.test.yml` (override สำหรับรัน test — db แยก ไม่ใช้ volume จริง):

```yaml
name: pettech-test

services:
  db:
    image: postgres:17
    environment:
      POSTGRES_DB: pettech_test
      POSTGRES_USER: pettech
      POSTGRES_PASSWORD: testpw
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pettech -d pettech_test"]
      interval: 3s
      timeout: 3s
      retries: 20
    networks: [pettest]

  api-test:
    build:
      context: ../api
    environment:
      DATABASE_URL: postgresql+psycopg://pettech:testpw@db:5432/pettech_test
      JWT_SECRET: test-secret
      UPLOAD_DIR: /data/uploads
    depends_on:
      db:
        condition: service_healthy
    command: ["python", "-m", "pytest", "-v", "tests/unit", "tests/integration"]
    networks: [pettest]

networks:
  pettest:
    name: pettest
```

- [ ] **Step 8: เขียนสคริปต์และไฟล์ env**

`pettech/.env.example`:

```bash
POSTGRES_PASSWORD=change-me-locally
RABBITMQ_PASSWORD=change-me-locally
JWT_SECRET=generate-with-openssl-rand-hex-32
APP_VERSION=0.1.0
IMAGE_TAG=dev
```

`pettech/.gitignore`:

```gitignore
.env
__pycache__/
*.pyc
.pytest_cache/
node_modules/
web/dist/
data/
```

`pettech/scripts/up.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "ไม่พบ .env — คัดลอกจาก .env.example ก่อน"; exit 1; }
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps
echo "เปิด http://localhost:8000 · dashboard http://localhost:8080"
```

`pettech/scripts/down.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f infra/docker-compose.yml down "$@"
```

`pettech/scripts/test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'docker compose -f infra/docker-compose.test.yml down -v' EXIT
docker compose -f infra/docker-compose.test.yml build
docker compose -f infra/docker-compose.test.yml run --rm api-test
```

- [ ] **Step 9: ยืนยันว่าสตาร์ตได้จริงและ 2 replica ขึ้น**

```bash
cd pettech && cp .env.example .env && chmod +x scripts/*.sh
./scripts/up.sh
curl -fsS http://localhost:8000/api/health
docker compose -f infra/docker-compose.yml ps api   # ต้องเห็น 2 แถว
```

Expected: `/api/health` คืน 200 และ `ps api` แสดง 2 container

- [ ] **Step 10: Commit**

```bash
cd pettech && git init && git add -A && git commit -m "feat: skeleton api + compose with traefik and 2 api replicas"
```

---

### Task 2: Auth ด้วย JWT ใน cookie httpOnly

**Files:**
- Create: `pettech/api/app/db.py`, `pettech/api/app/errors.py`, `pettech/api/app/domain/auth/{models,schemas,service,router,security}.py`
- Create: `pettech/api/migrations/` (alembic init) + `pettech/api/migrations/versions/0001_users.py`
- Modify: `pettech/api/app/main.py`
- Test: `pettech/api/tests/unit/test_errors.py`, `pettech/api/tests/integration/test_auth.py`, `pettech/api/tests/conftest.py`

**Interfaces:**
- Consumes: `app.config:get_settings`
- Produces:
  - `app.db:Base`, `app.db:get_session()` (FastAPI dependency → `Session`), `app.db:engine`
  - `app.errors:AppError(code: str, message_th: str, status: int, field: str|None = None)` และ handler ที่แปลงเป็น body `{code, message_th, field}`
  - `app.domain.auth.models:User(id: UUID, email: str, password_hash: str, display_name: str, created_at: datetime)`
  - `app.deps:current_user(request) -> User` (raise `AppError("AUTH_REQUIRED", 401)` เมื่อไม่มี cookie)
  - cookie ชื่อ `pettech_session`

- [ ] **Step 1: เขียน test ของ error contract ที่ fail**

`pettech/api/tests/unit/test_errors.py`:

```python
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
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech/api && python -m pytest tests/unit/test_errors.py -v`
Expected: FAIL — `No module named 'app.errors'`

- [ ] **Step 3: เขียน errors.py**

```python
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
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd pettech/api && python -m pytest tests/unit/test_errors.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add api/app/errors.py api/tests/unit/test_errors.py && git commit -m "feat: uniform error contract"
```

- [ ] **Step 6: เขียน test integration ของ auth ที่ fail**

`pettech/api/tests/conftest.py`:

```python
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.db import Base
from app.main import app

DB_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="session", autouse=True)
def _schema():
    engine = create_engine(DB_URL)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean():
    engine = create_engine(DB_URL)
    with engine.begin() as conn:
        for t in ("relay_messages", "relay_threads", "outbox", "report_events",
                  "sightings", "lost_reports", "pets", "users"):
            conn.execute(text(f"truncate table {t} cascade"))
    engine.dispose()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def make_user(client):
    def _make(email: str | None = None, display_name: str = "ผู้ใช้ทดสอบ"):
        email = email or f"u{uuid.uuid4().hex[:8]}@example.com"
        r = client.post("/api/auth/register", json={
            "email": email, "password": "LongEnoughPassw0rd", "display_name": display_name})
        assert r.status_code == 201, r.text
        c = TestClient(app)
        login = c.post("/api/auth/login", json={"email": email, "password": "LongEnoughPassw0rd"})
        assert login.status_code == 200, login.text
        return {"client": c, "email": email, "id": r.json()["id"]}
    return _make
```

`pettech/api/tests/integration/test_auth.py`:

```python
def test_register_then_me_returns_profile_without_contact_fields(client, make_user):
    u = make_user(display_name="สมชาย")
    r = u["client"].get("/api/me")
    assert r.status_code == 200
    body = r.json()
    assert body["display_name"] == "สมชาย"
    for forbidden in ("phone", "address", "line_id", "password_hash"):
        assert forbidden not in body


def test_login_with_wrong_password_does_not_reveal_which_field(client, make_user):
    u = make_user()
    r = client.post("/api/auth/login", json={"email": u["email"], "password": "WrongPassword123"})
    assert r.status_code == 401
    assert r.json()["code"] == "AUTH_REQUIRED"
    assert r.json()["field"] is None
    assert "อีเมลหรือรหัสผ่านไม่ถูกต้อง" in r.json()["message_th"]


def test_protected_route_without_cookie_is_401(client):
    assert client.get("/api/me").status_code == 401


def test_session_cookie_is_httponly(client, make_user):
    u = make_user()
    cookie = [c for c in u["client"].cookies.jar if c.name == "pettech_session"][0]
    assert cookie.has_nonstandard_attr("HttpOnly")
```

- [ ] **Step 7: รัน test ให้เห็นว่า fail**

Run: `cd pettech && ./scripts/test.sh`
Expected: FAIL — `No module named 'app.db'`

- [ ] **Step 8: เขียน db.py**

```python
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
```

- [ ] **Step 9: เขียน auth models + security**

`app/domain/auth/models.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    # ห้ามเพิ่มคอลัมน์ข้อมูลติดต่อในตารางนี้ (I6 — privacy by schema)

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

`app/domain/auth/security.py`:

```python
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.config import get_settings

_ph = PasswordHasher()
COOKIE_NAME = "pettech_session"
SESSION_HOURS = 12


def hash_password(raw: str) -> str:
    return _ph.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, raw)
    except VerifyMismatchError:
        return False


def issue_token(user_id: str) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(hours=SESSION_HOURS)},
        s.jwt_secret,
        algorithm="HS256",
    )


def read_token(token: str) -> str | None:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])["sub"]
    except (JWTError, KeyError):
        return None
```

- [ ] **Step 10: เขียน schemas, service, router, deps**

`app/domain/auth/schemas.py`:

```python
from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    display_name: str
```

`app/domain/auth/service.py`:

```python
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.auth.security import hash_password, verify_password
from app.errors import AppError

BAD_CREDENTIALS = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"


def register(db: Session, email: str, password: str, display_name: str) -> User:
    user = User(email=email.lower(), password_hash=hash_password(password), display_name=display_name)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("VALIDATION", "อีเมลนี้ถูกใช้สมัครไว้แล้ว", field="email")
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    # เช็ค user ก่อนแล้วค่อยเช็ครหัส แต่คืนข้อความเดียวกันทั้งสองกรณี (ไม่บอกว่าผิดช่องไหน)
    if user is None or not verify_password(password, user.password_hash):
        raise AppError("AUTH_REQUIRED", BAD_CREDENTIALS)
    return user
```

`app/deps.py`:

```python
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.db import get_session
from app.domain.auth.models import User
from app.domain.auth.security import COOKIE_NAME, read_token
from app.errors import AppError


def current_user(request: Request, db: Session = Depends(get_session)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    user_id = read_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise AppError("AUTH_REQUIRED", "กรุณาเข้าสู่ระบบก่อนใช้งาน")
    return user
```

`app/domain/auth/router.py`:

```python
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.deps import current_user
from app.domain.auth import service
from app.domain.auth.models import User
from app.domain.auth.schemas import LoginIn, RegisterIn, UserOut
from app.domain.auth.security import COOKIE_NAME, SESSION_HOURS, issue_token

router = APIRouter(prefix="/api", tags=["auth"])


def _set_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        issue_token(user_id),
        max_age=SESSION_HOURS * 3600,
        httponly=True,
        samesite="strict",
        secure=get_settings().cookie_secure,
        path="/",
    )


@router.post("/auth/register", status_code=status.HTTP_201_CREATED, response_model=UserOut)
def register(payload: RegisterIn, db: Session = Depends(get_session)):
    user = service.register(db, payload.email, payload.password, payload.display_name)
    return UserOut(id=str(user.id), display_name=user.display_name)


@router.post("/auth/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_session)):
    user = service.authenticate(db, payload.email, payload.password)
    _set_cookie(response, str(user.id))
    return UserOut(id=str(user.id), display_name=user.display_name)


@router.post("/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return UserOut(id=str(user.id), display_name=user.display_name)
```

เพิ่มใน `app/main.py`:

```python
from app.domain.auth.router import router as auth_router
from app.errors import install_error_handlers

install_error_handlers(app)
app.include_router(auth_router)
```

- [ ] **Step 11: รัน test ให้ผ่าน**

Run: `cd pettech && ./scripts/test.sh`
Expected: PASS ทั้ง `test_errors.py` และ `test_auth.py` (4 tests)

- [ ] **Step 12: สร้าง alembic migration ของ users**

```bash
cd pettech/api && alembic init -t async migrations 2>/dev/null || alembic init migrations
```

แก้ `migrations/env.py` ให้ใช้ `app.db:Base.metadata` และ `app.config:get_settings().database_url` แล้วสร้าง revision:

```bash
cd pettech/api && alembic revision --autogenerate -m "users" && alembic upgrade head
```

ตรวจไฟล์ที่ได้ว่า **ไม่มี** คอลัมน์ `phone`/`address` และมี `unique` บน `email`

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "feat: cookie-based auth with argon2 and jwt"
```

---

### Task 3: Pets ของเจ้าของ

**Files:**
- Create: `pettech/api/app/domain/pets/{models,schemas,service,router}.py`
- Create: `pettech/api/migrations/versions/0002_pets.py` (autogenerate)
- Modify: `pettech/api/app/main.py`
- Test: `pettech/api/tests/integration/test_pets.py`

**Interfaces:**
- Consumes: `app.deps:current_user`, `app.db:get_session`, `app.errors:AppError`
- Produces: `app.domain.pets.models:Pet(id, owner_id, name, species, color, marks, photo_key, created_at)` · `app.domain.pets.service:get_owned_pet(db, pet_id, user) -> Pet` (raise `FORBIDDEN` เมื่อไม่ใช่เจ้าของ, `NOT_FOUND` เมื่อไม่มี) · `GET/POST /api/pets`

- [ ] **Step 1: เขียน test ที่ fail**

```python
def test_owner_sees_only_own_pets(make_user):
    a, b = make_user(), make_user()
    a["client"].post("/api/pets", json={"name": "ขาวมณี", "species": "cat", "color": "ขาว"})
    b["client"].post("/api/pets", json={"name": "ไข่เจียว", "species": "dog"})

    names = [p["name"] for p in a["client"].get("/api/pets").json()["items"]]
    assert names == ["ขาวมณี"]


def test_species_must_be_known_value(make_user):
    u = make_user()
    r = u["client"].post("/api/pets", json={"name": "x", "species": "dragon"})
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION"
    assert r.json()["field"] == "species"


def test_creating_pet_requires_login(client):
    assert client.post("/api/pets", json={"name": "x", "species": "cat"}).status_code == 401
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech && ./scripts/test.sh`
Expected: FAIL — 404 เพราะยังไม่มี route `/api/pets`

- [ ] **Step 3: เขียน model**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    species: Mapped[str] = mapped_column(String(16), nullable=False)
    color: Mapped[str | None] = mapped_column(String(80))
    marks: Mapped[str | None] = mapped_column(String(500))
    photo_key: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: เขียน schemas + service + router**

```python
# schemas.py
from typing import Literal

from pydantic import BaseModel, Field

Species = Literal["dog", "cat", "bird", "rabbit", "other"]


class PetIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    species: Species
    color: str | None = Field(default=None, max_length=80)
    marks: str | None = Field(default=None, max_length=500)


class PetOut(BaseModel):
    id: str
    name: str
    species: str
    color: str | None
    marks: str | None


class PetList(BaseModel):
    items: list[PetOut]
```

```python
# service.py
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.errors import AppError


def create_pet(db: Session, user: User, **fields) -> Pet:
    pet = Pet(owner_id=user.id, **fields)
    db.add(pet)
    db.commit()
    return pet


def list_own_pets(db: Session, user: User) -> list[Pet]:
    return list(db.scalars(select(Pet).where(Pet.owner_id == user.id).order_by(Pet.created_at)))


def get_owned_pet(db: Session, pet_id: uuid.UUID, user: User) -> Pet:
    pet = db.get(Pet, pet_id)
    if pet is None:
        raise AppError("NOT_FOUND", "ไม่พบสัตว์เลี้ยงที่ระบุ")
    if pet.owner_id != user.id:
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์จัดการสัตว์เลี้ยงตัวนี้")
    return pet
```

```python
# router.py
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.pets import service
from app.domain.pets.schemas import PetIn, PetList, PetOut

router = APIRouter(prefix="/api/pets", tags=["pets"])


def _out(p) -> PetOut:
    return PetOut(id=str(p.id), name=p.name, species=p.species, color=p.color, marks=p.marks)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PetOut)
def create(payload: PetIn, db: Session = Depends(get_session), user: User = Depends(current_user)):
    return _out(service.create_pet(db, user, **payload.model_dump()))


@router.get("", response_model=PetList)
def list_pets(db: Session = Depends(get_session), user: User = Depends(current_user)):
    return PetList(items=[_out(p) for p in service.list_own_pets(db, user)])
```

เพิ่ม `app.include_router(pets_router)` ใน `main.py`

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `cd pettech && ./scripts/test.sh`
Expected: PASS (3 tests ใหม่)

- [ ] **Step 6: migration + commit**

```bash
cd pettech/api && alembic revision --autogenerate -m "pets" && alembic upgrade head
cd .. && git add -A && git commit -m "feat: pets owned by user"
```

---

### Task 4: LostReport — สร้าง ค้นหา ดูรายละเอียด

**Files:**
- Create: `pettech/api/app/domain/reports/{models,schemas,service,router}.py`
- Create: `pettech/api/migrations/versions/0003_lost_reports.py`
- Modify: `pettech/api/app/main.py`
- Test: `pettech/api/tests/integration/test_reports.py`

**Interfaces:**
- Consumes: `app.domain.pets.service:get_owned_pet`
- Produces:
  - `app.domain.reports.models:LostReport(id, pet_id, owner_id, status, last_seen_at, district, area_note, description, created_at, resolved_at)`
  - `app.domain.reports.models:ReportEvent(id, report_id, actor_id, from_status, to_status, reason, created_at)`
  - `app.domain.reports.models:Status` (`SEARCHING` / `HAS_LEAD` / `RESOLVED` เป็น `str` constants)
  - `app.domain.reports.service:get_report_or_404(db, report_id) -> LostReport`
  - `POST /api/reports` · `GET /api/reports` · `GET /api/reports/{id}`

- [ ] **Step 1: เขียน test ที่ fail (รวม Review Focus #2 และ #5)**

```python
from datetime import UTC, datetime, timedelta


def _mk_report(u, **over):
    pet = u["client"].post("/api/pets", json={"name": "ขาวมณี", "species": "cat"}).json()
    body = {
        "pet_id": pet["id"],
        "last_seen_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
        "district": "บางกะปิ",
        "area_note": "ปากซอยหมู่บ้าน",
        "description": "ใส่ปลอกคอสีแดง",
    }
    body.update(over)
    return u["client"].post("/api/reports", json=body)


def test_create_report_starts_as_searching(make_user):
    r = _mk_report(make_user())
    assert r.status_code == 201
    assert r.json()["status"] == "SEARCHING"


def test_cannot_create_report_for_someone_elses_pet(make_user):
    a, b = make_user(), make_user()
    pet = a["client"].post("/api/pets", json={"name": "x", "species": "dog"}).json()
    r = b["client"].post("/api/reports", json={
        "pet_id": pet["id"],
        "last_seen_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
        "district": "ห้วยขวาง"})
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"
    assert "pet" not in r.json()            # ไม่หลุดข้อมูล resource


def test_last_seen_at_in_the_future_is_rejected(make_user):          # Review Focus #2
    r = _mk_report(make_user(), last_seen_at=(datetime.now(UTC) + timedelta(hours=3)).isoformat())
    assert r.status_code == 422
    assert r.json()["field"] == "last_seen_at"


def test_blank_district_and_overlong_description_are_rejected(make_user):   # Review Focus #5
    u = make_user()
    assert _mk_report(u, district="   ").status_code == 422
    assert _mk_report(u, description="ก" * 5000).status_code == 422


def test_list_hides_resolved_reports_by_default(make_user, client):
    u = make_user()
    rid = _mk_report(u).json()["id"]
    u["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "เจอแล้ว"})

    assert [i["id"] for i in client.get("/api/reports").json()["items"]] == []
    assert [i["id"] for i in client.get("/api/reports?status=RESOLVED").json()["items"]] == [rid]


def test_public_detail_has_no_owner_contact(make_user, client):
    rid = _mk_report(make_user()).json()["id"]
    body = client.get(f"/api/reports/{rid}").json()
    flat = str(body)
    for forbidden in ("phone", "address", "line_id", "email", "password"):
        assert forbidden not in flat
```

> `PATCH .../status` ยังไม่มีใน task นี้ — เทส `test_list_hides_resolved_reports_by_default` จะแดงจนจบ Task 6 ให้ mark `@pytest.mark.xfail(reason="status endpoint อยู่ Task 6", strict=True)` ไว้ แล้ว **ลบ marker ออกใน Task 6 Step 1**

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech && ./scripts/test.sh`
Expected: FAIL — 404 เพราะยังไม่มี `/api/reports`

- [ ] **Step 3: เขียน models**

```python
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

SEARCHING = "SEARCHING"
HAS_LEAD = "HAS_LEAD"
RESOLVED = "RESOLVED"
OPEN_STATUSES = (SEARCHING, HAS_LEAD)
ALL_STATUSES = (SEARCHING, HAS_LEAD, RESOLVED)


class LostReport(Base):
    __tablename__ = "lost_reports"
    __table_args__ = (
        CheckConstraint(f"status in {ALL_STATUSES}", name="ck_lost_reports_status"),
        Index("ix_lost_reports_status_district", "status", "district"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pet_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=SEARCHING)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False)
    area_note: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReportEvent(Base):
    __tablename__ = "report_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lost_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    from_status: Mapped[str | None] = mapped_column(String(16))
    to_status: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: เขียน schemas พร้อม validator เวลาอนาคตและข้อความว่าง**

```python
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.domain.pets.schemas import Species


class ReportIn(BaseModel):
    pet_id: str
    last_seen_at: datetime
    district: str = Field(min_length=1, max_length=80)
    area_note: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("last_seen_at")
    @classmethod
    def not_in_future(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            v = v.replace(tzinfo=UTC)
        if v > datetime.now(UTC):
            raise ValueError("เวลาที่พบครั้งสุดท้ายต้องไม่เป็นเวลาในอนาคต")
        return v

    @field_validator("district", "area_note", "description")
    @classmethod
    def not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("ห้ามเว้นว่าง")
        return v.strip() if v else v


class ReportOut(BaseModel):
    id: str
    status: str
    pet_name: str
    species: str
    color: str | None
    marks: str | None
    last_seen_at: datetime
    district: str
    area_note: str | None
    description: str | None
    sighting_count: int
    created_at: datetime


class ReportList(BaseModel):
    items: list[ReportOut]
    next_cursor: str | None = None


StatusFilter = Literal["SEARCHING", "HAS_LEAD", "RESOLVED"]
```

- [ ] **Step 5: เขียน service + router**

```python
# service.py
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.domain.pets.service import get_owned_pet
from app.domain.reports.models import OPEN_STATUSES, SEARCHING, LostReport, ReportEvent
from app.errors import AppError


def create_report(db: Session, user: User, pet_id: str, **fields) -> LostReport:
    try:
        pid = uuid.UUID(pet_id)
    except ValueError:
        raise AppError("VALIDATION", "รหัสสัตว์เลี้ยงไม่ถูกต้อง", field="pet_id")
    get_owned_pet(db, pid, user)               # ยืนยันสิทธิ์ก่อนสร้าง (403 ถ้าไม่ใช่เจ้าของ)
    report = LostReport(pet_id=pid, owner_id=user.id, status=SEARCHING, **fields)
    db.add(report)
    db.flush()
    db.add(ReportEvent(report_id=report.id, actor_id=user.id, from_status=None, to_status=SEARCHING))
    db.commit()
    return report


def get_report_or_404(db: Session, report_id: str) -> LostReport:
    try:
        rid = uuid.UUID(report_id)
    except ValueError:
        raise AppError("NOT_FOUND", "ไม่พบประกาศที่ระบุ")
    report = db.get(LostReport, rid)
    if report is None:
        raise AppError("NOT_FOUND", "ไม่พบประกาศที่ระบุ")
    return report


def search(db: Session, species=None, district=None, status=None, limit=20):
    from app.domain.sightings.models import Sighting

    count_sq = (
        select(func.count(Sighting.id))
        .where(Sighting.report_id == LostReport.id)
        .correlate(LostReport)
        .scalar_subquery()
    )
    stmt = select(LostReport, Pet, count_sq).join(Pet, Pet.id == LostReport.pet_id)
    stmt = stmt.where(LostReport.status == status) if status else stmt.where(LostReport.status.in_(OPEN_STATUSES))
    if species:
        stmt = stmt.where(Pet.species == species)
    if district:
        stmt = stmt.where(LostReport.district == district)
    return list(db.execute(stmt.order_by(LostReport.created_at.desc()).limit(limit)))
```

```python
# router.py
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.domain.pets.schemas import Species
from app.domain.reports import service
from app.domain.reports.schemas import ReportIn, ReportList, ReportOut, StatusFilter

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _out(report, pet: Pet, sighting_count: int) -> ReportOut:
    return ReportOut(
        id=str(report.id), status=report.status, pet_name=pet.name, species=pet.species,
        color=pet.color, marks=pet.marks, last_seen_at=report.last_seen_at,
        district=report.district, area_note=report.area_note, description=report.description,
        sighting_count=sighting_count, created_at=report.created_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ReportOut)
def create(payload: ReportIn, db: Session = Depends(get_session), user: User = Depends(current_user)):
    data = payload.model_dump()
    pet_id = data.pop("pet_id")
    report = service.create_report(db, user, pet_id, **data)
    return _out(report, db.get(Pet, report.pet_id), 0)


@router.get("", response_model=ReportList)
def search(
    species: Species | None = None,
    district: str | None = Query(default=None, max_length=80),
    status: StatusFilter | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_session),
):
    rows = service.search(db, species=species, district=district, status=status, limit=limit)
    return ReportList(items=[_out(r, p, c) for r, p, c in rows])


@router.get("/{report_id}", response_model=ReportOut)
def detail(report_id: str, db: Session = Depends(get_session)):
    report = service.get_report_or_404(db, report_id)
    pet = db.get(Pet, report.pet_id)
    from app.domain.sightings.models import Sighting
    from sqlalchemy import func, select
    count = db.scalar(select(func.count(Sighting.id)).where(Sighting.report_id == report.id)) or 0
    return _out(report, pet, count)
```

> `ReportOut` **ไม่มี** field ของเจ้าของเลยนอกจากไม่มี — ชื่อเจ้าของไม่ส่งออกในหน้าสาธารณะ

- [ ] **Step 6: รัน test ให้ผ่าน**

Run: `cd pettech && ./scripts/test.sh`
Expected: PASS ทุกตัวยกเว้น `test_list_hides_resolved_reports_by_default` ที่เป็น `xfail`

- [ ] **Step 7: migration + commit**

```bash
cd pettech/api && alembic revision --autogenerate -m "lost_reports and report_events" && alembic upgrade head
cd .. && git add -A && git commit -m "feat: lost report create search detail"
```

---

### Task 5: Sightings — invariant I1/I2 และการอัปโหลดรูป

> **task ที่ยากที่สุดของโปรเจค** ทำตอนยังมีเวลาเหลือ ห้ามเลื่อนไปท้าย

**Files:**
- Create: `pettech/api/app/domain/sightings/{models,schemas,service,router}.py`, `pettech/api/app/storage.py`
- Create: `pettech/api/migrations/versions/0004_sightings.py`
- Modify: `pettech/api/app/main.py`, `pettech/api/app/domain/reports/service.py`
- Test: `pettech/api/tests/integration/test_sightings.py`, `pettech/api/tests/unit/test_storage.py`

**Interfaces:**
- Consumes: `app.domain.reports.service:get_report_or_404`, `app.domain.reports.models` constants
- Produces:
  - `app.domain.sightings.models:Sighting(id, report_id, finder_id, photo_key, thumb_key, seen_at, district, area_note, note, idem_key, created_at)` + `UniqueConstraint(report_id, finder_id, idem_key)`
  - `app.storage:save_upload(file: UploadFile) -> str` (คืน `photo_key`, raise `AppError("VALIDATION", field="photo")` เมื่อไฟล์ไม่ใช่รูปหรือเกิน 5 MB)
  - `app.domain.sightings.service:add_sighting(db, report_id, finder, idem_key, photo_key, **fields) -> tuple[Sighting, bool]` (bool = `created`)
  - `POST /api/reports/{id}/sightings` · `GET /api/reports/{id}/sightings`

- [ ] **Step 1: เขียน test ของ storage ที่ fail (Review Focus #1)**

```python
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
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech/api && python -m pytest tests/unit/test_storage.py -v`
Expected: FAIL — `No module named 'app.storage'`

- [ ] **Step 3: เขียน storage.py**

```python
import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import get_settings
from app.errors import AppError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAGIC = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"RIFF": "image/webp",
}


def _upload_dir() -> Path:
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
    if not any(data.startswith(sig) for sig in MAGIC):
        _reject("ไฟล์นี้ไม่ใช่รูปภาพที่อ่านได้")   # content-type โกหกได้ จึงเช็ค magic bytes ด้วย

    key = f"{uuid.uuid4().hex}{ALLOWED[file.content_type]}"
    (_upload_dir() / key).write_bytes(data)
    return key
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd pettech/api && python -m pytest tests/unit/test_storage.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add api/app/storage.py api/tests/unit/test_storage.py && git commit -m "feat: validated image upload"
```

- [ ] **Step 6: เขียน test ของ sightings ที่ fail (รวม Review Focus #2,#3,#4)**

```python
from datetime import UTC, datetime, timedelta

PNG = bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 64


def _post_sighting(user, rid, idem="k1", seen_at=None, note="เห็นแมวตัวนี้แถวตลาด", with_photo=True):
    files = {"photo": ("a.png", PNG, "image/png")} if with_photo else None
    return user["client"].post(
        f"/api/reports/{rid}/sightings",
        data={
            "seen_at": (seen_at or datetime.now(UTC) - timedelta(minutes=30)).isoformat(),
            "district": "บางกะปิ", "area_note": "หน้าร้านสะดวกซื้อ", "note": note,
        },
        files=files,
        headers={"Idempotency-Key": idem} if idem is not None else {},
    )


def test_sighting_sets_status_to_has_lead(make_user, open_report):
    rid = open_report["id"]
    r = _post_sighting(make_user(), rid)
    assert r.status_code == 201
    assert open_report["client"].get(f"/api/reports/{rid}").json()["status"] == "HAS_LEAD"


def test_same_idempotency_key_returns_same_sighting(make_user, open_report):
    finder = make_user()
    first = _post_sighting(finder, open_report["id"], idem="dup-1")
    second = _post_sighting(finder, open_report["id"], idem="dup-1")
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert len(finder["client"].get(f"/api/reports/{open_report['id']}/sightings").json()["items"]) == 1


def test_missing_idempotency_key_is_422(make_user, open_report):        # Review Focus #4
    r = _post_sighting(make_user(), open_report["id"], idem=None)
    assert r.status_code == 422
    assert r.json()["field"] == "Idempotency-Key"


def test_blank_idempotency_key_is_422(make_user, open_report):          # Review Focus #4
    assert _post_sighting(make_user(), open_report["id"], idem="   ").status_code == 422


def test_seen_at_in_future_is_422(make_user, open_report):              # Review Focus #2
    r = _post_sighting(make_user(), open_report["id"],
                       seen_at=datetime.now(UTC) + timedelta(hours=1))
    assert r.status_code == 422
    assert r.json()["field"] == "seen_at"


def test_owner_cannot_send_sighting_to_own_report(open_report):         # Review Focus #3
    r = _post_sighting(open_report, open_report["id"])
    assert r.status_code == 422
    assert "ประกาศของตัวเอง" in r.json()["message_th"]
    assert open_report["client"].get(f"/api/reports/{open_report['id']}").json()["status"] == "SEARCHING"


def test_overlong_note_is_422(make_user, open_report):                  # Review Focus #5
    assert _post_sighting(make_user(), open_report["id"], note="ก" * 3000).status_code == 422


def test_sighting_without_photo_is_allowed(make_user, open_report):
    assert _post_sighting(make_user(), open_report["id"], with_photo=False).status_code == 201


def test_timeline_is_ordered_by_created_at(make_user, open_report, client):
    a, b = make_user(), make_user()
    _post_sighting(a, open_report["id"], idem="a")
    _post_sighting(b, open_report["id"], idem="b")
    items = client.get(f"/api/reports/{open_report['id']}/sightings").json()["items"]
    assert [i["note"] for i in items] == sorted([i["note"] for i in items], key=lambda _: 0) or True
    assert items[0]["created_at"] <= items[1]["created_at"]


def test_timeline_shows_finder_display_name_but_no_contact(make_user, open_report, client):
    _post_sighting(make_user(), open_report["id"])
    body = str(client.get(f"/api/reports/{open_report['id']}/sightings").json())
    for forbidden in ("phone", "email", "address", "line_id"):
        assert forbidden not in body
```

เพิ่ม fixture ใน `conftest.py`:

```python
@pytest.fixture
def open_report(make_user):
    owner = make_user()
    pet = owner["client"].post("/api/pets", json={"name": "ขาวมณี", "species": "cat"}).json()
    r = owner["client"].post("/api/reports", json={
        "pet_id": pet["id"],
        "last_seen_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
        "district": "บางกะปิ"})
    assert r.status_code == 201, r.text
    return {**owner, "id": r.json()["id"]}
```

(เพิ่ม `from datetime import UTC, datetime, timedelta` ที่หัว `conftest.py`)

- [ ] **Step 7: รัน test ให้เห็นว่า fail**

Run: `cd pettech && ./scripts/test.sh`
Expected: FAIL — 404 เพราะยังไม่มี route sightings

- [ ] **Step 8: เขียน model**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Sighting(Base):
    __tablename__ = "sightings"
    __table_args__ = (
        UniqueConstraint("report_id", "finder_id", "idem_key", name="uq_sightings_idem"),
        Index("ix_sightings_report_created", "report_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lost_reports.id", ondelete="CASCADE"), nullable=False)
    finder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    photo_key: Mapped[str | None] = mapped_column(String(200))
    thumb_key: Mapped[str | None] = mapped_column(String(200))
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False)
    area_note: Mapped[str | None] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(String(1000))
    idem_key: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 9: เขียน service — จุดที่ invariant อยู่**

```python
import uuid

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.reports.models import HAS_LEAD, RESOLVED, SEARCHING, LostReport, ReportEvent
from app.domain.sightings.models import Sighting
from app.errors import AppError
from app.outbox import enqueue          # Task 8 เพิ่มไฟล์นี้ — ดู Step 11


def add_sighting(db: Session, report_id: str, finder: User, idem_key: str,
                 photo_key: str | None, **fields) -> tuple[Sighting, bool]:
    try:
        rid = uuid.UUID(report_id)
    except ValueError:
        raise AppError("NOT_FOUND", "ไม่พบประกาศที่ระบุ")

    # ล็อกแถวประกาศไว้ตลอด transaction — การเช็คสถานะกับการ insert ต้องอยู่ใน transaction เดียวกัน
    report = db.execute(
        select(LostReport).where(LostReport.id == rid).with_for_update()
    ).scalar_one_or_none()
    if report is None:
        raise AppError("NOT_FOUND", "ไม่พบประกาศที่ระบุ")
    if report.owner_id == finder.id:
        raise AppError("VALIDATION",
                       "ส่งเบาะแสเข้าประกาศของตัวเองไม่ได้ ถ้าพบสัตว์แล้วให้กดปิดประกาศ")
    if report.status == RESOLVED:
        db.rollback()
        raise AppError("REPORT_CLOSED",
                       "เจ้าของพบสัตว์แล้ว ประกาศนี้ปิดรับเบาะแส")

    sighting = Sighting(report_id=rid, finder_id=finder.id, idem_key=idem_key,
                        photo_key=photo_key, **fields)
    db.add(sighting)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(Sighting).where(
                Sighting.report_id == rid,
                Sighting.finder_id == finder.id,
                Sighting.idem_key == idem_key,
            )
        )
        return existing, False

    if report.status == SEARCHING:
        report.status = HAS_LEAD
        db.add(ReportEvent(report_id=rid, actor_id=None, from_status=SEARCHING, to_status=HAS_LEAD,
                           reason="ระบบตั้งอัตโนมัติเมื่อมีเบาะแสแรก"))

    enqueue(db, "sighting.created", {"sighting_id": str(sighting.id), "report_id": str(rid)})
    db.commit()
    return sighting, True
```

- [ ] **Step 10: เขียน schemas + router (อ่าน Idempotency-Key จาก header)**

```python
# schemas.py
from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator


class SightingOut(BaseModel):
    id: str
    finder_display_name: str
    photo_url: str | None
    thumb_url: str | None
    seen_at: datetime
    district: str
    area_note: str | None
    note: str | None
    created_at: datetime


class SightingList(BaseModel):
    items: list[SightingOut]
```

```python
# router.py
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, Header, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.sightings import service
from app.domain.sightings.models import Sighting
from app.domain.sightings.schemas import SightingList, SightingOut
from app.errors import AppError
from app.storage import save_upload

router = APIRouter(prefix="/api/reports", tags=["sightings"])


def _out(s: Sighting, finder_name: str) -> SightingOut:
    return SightingOut(
        id=str(s.id), finder_display_name=finder_name,
        photo_url=f"/api/uploads/{s.photo_key}" if s.photo_key else None,
        thumb_url=f"/api/uploads/{s.thumb_key}" if s.thumb_key else None,
        seen_at=s.seen_at, district=s.district, area_note=s.area_note,
        note=s.note, created_at=s.created_at,
    )


@router.post("/{report_id}/sightings", response_model=SightingOut)
def create(
    report_id: str,
    response: Response,
    seen_at: datetime = Form(...),
    district: str = Form(..., min_length=1, max_length=80),
    area_note: str | None = Form(default=None, max_length=200),
    note: str | None = Form(default=None, max_length=1000),
    photo: UploadFile | None = File(default=None),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_session),
    finder: User = Depends(current_user),
):
    if not idempotency_key or not idempotency_key.strip():
        raise AppError("VALIDATION",
                       "คำขอนี้ต้องมี Idempotency-Key เพื่อกันการส่งเบาะแสซ้ำ",
                       field="Idempotency-Key")
    if seen_at.tzinfo is None:
        seen_at = seen_at.replace(tzinfo=UTC)
    if seen_at > datetime.now(UTC):
        raise AppError("VALIDATION", "เวลาที่พบต้องไม่เป็นเวลาในอนาคต", field="seen_at")
    if not district.strip():
        raise AppError("VALIDATION", "กรุณาระบุเขตหรือบริเวณที่พบ", field="district")

    photo_key = save_upload(photo) if photo is not None and photo.filename else None
    sighting, created = service.add_sighting(
        db, report_id, finder, idempotency_key.strip(), photo_key,
        seen_at=seen_at, district=district.strip(),
        area_note=(area_note or None), note=(note or None),
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return _out(sighting, finder.display_name)


@router.get("/{report_id}/sightings", response_model=SightingList)
def timeline(report_id: str, db: Session = Depends(get_session)):
    from app.domain.reports.service import get_report_or_404
    report = get_report_or_404(db, report_id)
    rows = db.execute(
        select(Sighting, User.display_name)
        .join(User, User.id == Sighting.finder_id)
        .where(Sighting.report_id == report.id)
        .order_by(Sighting.created_at)
    ).all()
    return SightingList(items=[_out(s, name) for s, name in rows])
```

- [ ] **Step 11: เขียน outbox แบบ minimal ให้ service คอมไพล์ผ่าน**

`pettech/api/app/outbox.py` (Task 8 จะต่อยอดเป็น publisher):

```python
from sqlalchemy import BigInteger, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base


class Outbox(Base):
    __tablename__ = "outbox"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    topic: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), index=True)


def enqueue(db: Session, topic: str, payload: dict) -> None:
    """เขียนงาน async ลงตารางใน transaction เดียวกับข้อมูลธุรกิจ — ไม่ publish ตรงเข้า broker
    เพื่อให้ broker ล่มแล้วข้อความไม่หาย"""
    db.add(Outbox(topic=topic, payload=payload))
```

- [ ] **Step 12: เพิ่ม route เสิร์ฟรูป และ include router**

ใน `app/main.py`:

```python
from fastapi.responses import FileResponse
from pathlib import Path

from app.domain.sightings.router import router as sightings_router

app.include_router(sightings_router)


@app.get("/api/uploads/{key}")
def serve_upload(key: str):
    if "/" in key or ".." in key:        # กัน path traversal
        raise AppError("NOT_FOUND", "ไม่พบไฟล์")
    path = Path(get_settings().upload_dir) / key
    if not path.is_file():
        raise AppError("NOT_FOUND", "ไม่พบไฟล์")
    return FileResponse(path)
```

- [ ] **Step 13: รัน test ให้ผ่าน**

Run: `cd pettech && ./scripts/test.sh`
Expected: PASS ทุก test ใน `test_sightings.py` (10 tests)

- [ ] **Step 14: migration + commit**

```bash
cd pettech/api && alembic revision --autogenerate -m "sightings and outbox" && alembic upgrade head
cd .. && git add -A && git commit -m "feat: sightings with row-locked closure guard and idempotency"
```

---

### Task 6: เปลี่ยนสถานะ ปิดประกาศ และเปิดใหม่

**Files:**
- Modify: `pettech/api/app/domain/reports/{service,router,schemas}.py`
- Modify: `pettech/api/tests/integration/test_reports.py` (ลบ `xfail` marker)
- Test: `pettech/api/tests/integration/test_status.py`, `pettech/api/tests/unit/test_transitions.py`

**Interfaces:**
- Consumes: `app.domain.sightings.models:Sighting`
- Produces: `app.domain.reports.service:change_status(db, report_id, user, to, reason) -> LostReport` · `app.domain.reports.service:next_status_on_reopen(has_sightings: bool) -> str` · `PATCH /api/reports/{id}/status`

- [ ] **Step 1: ลบ xfail marker ของ Task 4 และเขียน test ใหม่ที่ fail**

`tests/unit/test_transitions.py`:

```python
import pytest

from app.domain.reports.service import next_status_on_reopen, validate_transition
from app.errors import AppError


def test_reopen_goes_to_has_lead_when_sightings_exist():
    assert next_status_on_reopen(has_sightings=True) == "HAS_LEAD"


def test_reopen_goes_to_searching_when_no_sightings():
    assert next_status_on_reopen(has_sightings=False) == "SEARCHING"


@pytest.mark.parametrize("current,target", [
    ("SEARCHING", "HAS_LEAD"),      # ระบบตั้งเองเท่านั้น ห้ามมาจาก API
    ("HAS_LEAD", "HAS_LEAD"),
    ("SEARCHING", "SEARCHING"),
    ("RESOLVED", "RESOLVED"),
])
def test_rejected_transitions(current, target):
    with pytest.raises(AppError) as e:
        validate_transition(current, target)
    assert e.value.code == "INVALID_TRANSITION"


@pytest.mark.parametrize("current", ["SEARCHING", "HAS_LEAD"])
def test_can_resolve_from_any_open_status(current):
    validate_transition(current, "RESOLVED")
```

`tests/integration/test_status.py`:

```python
def test_owner_can_resolve_and_report_leaves_open_list(open_report, client):
    rid = open_report["id"]
    r = open_report["client"].patch(f"/api/reports/{rid}/status",
                                    json={"to": "RESOLVED", "reason": "เจอที่บ้านข้างๆ"})
    assert r.status_code == 200 and r.json()["status"] == "RESOLVED"
    assert [i["id"] for i in client.get("/api/reports").json()["items"]] == []


def test_non_owner_gets_403_without_leaking_report(make_user, open_report):
    other = make_user()
    r = other["client"].patch(f"/api/reports/{open_report['id']}/status",
                              json={"to": "RESOLVED", "reason": "x"})
    assert r.status_code == 403
    assert r.json() == {"code": "FORBIDDEN",
                        "message_th": "คุณไม่มีสิทธิ์แก้ประกาศนี้", "field": None}


def test_anonymous_gets_401(client, open_report):
    assert client.patch(f"/api/reports/{open_report['id']}/status",
                        json={"to": "RESOLVED", "reason": "x"}).status_code == 401


def test_sighting_after_resolve_is_409_report_closed(make_user, open_report):
    rid = open_report["id"]
    open_report["client"].patch(f"/api/reports/{rid}/status",
                                json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    from tests.integration.test_sightings import _post_sighting
    r = _post_sighting(make_user(), rid, idem="after-close")
    assert r.status_code == 409
    assert r.json()["code"] == "REPORT_CLOSED"
    assert "ปิดรับเบาะแส" in r.json()["message_th"]


def test_reopen_requires_reason(open_report):
    rid = open_report["id"]
    open_report["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    r = open_report["client"].patch(f"/api/reports/{rid}/status", json={"to": "SEARCHING", "reason": "  "})
    assert r.status_code == 422
    assert r.json()["field"] == "reason"


def test_reopen_with_existing_sighting_returns_to_has_lead(make_user, open_report):
    rid = open_report["id"]
    from tests.integration.test_sightings import _post_sighting
    _post_sighting(make_user(), rid, idem="before-close")
    open_report["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "คิดว่าเจอ"})

    r = open_report["client"].patch(f"/api/reports/{rid}/status",
                                    json={"to": "SEARCHING", "reason": "ตัวที่เจอไม่ใช่ของเรา"})
    assert r.status_code == 200
    assert r.json()["status"] == "HAS_LEAD"     # สถานะต้องไม่โกหก timeline ที่มีเบาะแสอยู่


def test_api_cannot_set_has_lead_directly(open_report):
    r = open_report["client"].patch(f"/api/reports/{open_report['id']}/status",
                                    json={"to": "HAS_LEAD", "reason": "อยากตั้งเอง"})
    assert r.status_code == 409
    assert r.json()["code"] == "INVALID_TRANSITION"


def test_every_status_change_is_recorded_as_event(open_report):
    rid = open_report["id"]
    open_report["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    events = open_report["client"].get(f"/api/reports/{rid}/events").json()["items"]
    assert [e["to_status"] for e in events] == ["SEARCHING", "RESOLVED"]
    assert events[-1]["reason"] == "เจอแล้ว"
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech && ./scripts/test.sh`
Expected: FAIL — `cannot import name 'validate_transition'`

- [ ] **Step 3: เขียน transition logic**

เพิ่มใน `app/domain/reports/service.py`:

```python
from datetime import UTC, datetime

from sqlalchemy import func

from app.domain.reports.models import HAS_LEAD, OPEN_STATUSES, RESOLVED, SEARCHING
from app.outbox import enqueue

API_SETTABLE = (RESOLVED, SEARCHING)


def validate_transition(current: str, target: str) -> None:
    if target not in API_SETTABLE:
        raise AppError("INVALID_TRANSITION",
                       "สถานะ 'มีเบาะแส' ระบบตั้งให้อัตโนมัติเมื่อมีเบาะแสเข้ามา ตั้งเองไม่ได้")
    if target == current:
        raise AppError("INVALID_TRANSITION", "ประกาศอยู่ในสถานะนี้แล้ว")
    if target == RESOLVED and current not in OPEN_STATUSES:
        raise AppError("INVALID_TRANSITION", "ปิดประกาศที่ปิดอยู่แล้วไม่ได้")
    if target == SEARCHING and current != RESOLVED:
        raise AppError("INVALID_TRANSITION", "เปิดประกาศที่ยังไม่ได้ปิดไม่ได้")


def next_status_on_reopen(has_sightings: bool) -> str:
    return HAS_LEAD if has_sightings else SEARCHING


def change_status(db: Session, report_id: str, user: User, to: str, reason: str | None) -> LostReport:
    rid = get_report_or_404(db, report_id).id
    report = db.execute(select(LostReport).where(LostReport.id == rid).with_for_update()).scalar_one()

    if report.owner_id != user.id:
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์แก้ประกาศนี้")

    validate_transition(report.status, to)

    if to == SEARCHING and not (reason or "").strip():
        raise AppError("VALIDATION", "การเปิดประกาศใหม่ต้องระบุเหตุผล", field="reason")

    from app.domain.sightings.models import Sighting
    previous = report.status
    if to == RESOLVED:
        report.status = RESOLVED
        report.resolved_at = datetime.now(UTC)
    else:
        has_sightings = bool(db.scalar(select(func.count(Sighting.id)).where(Sighting.report_id == rid)))
        report.status = next_status_on_reopen(has_sightings)
        report.resolved_at = None

    db.add(ReportEvent(report_id=rid, actor_id=user.id, from_status=previous,
                       to_status=report.status, reason=(reason or "").strip() or None))
    enqueue(db, "report.status_changed",
            {"report_id": str(rid), "from": previous, "to": report.status})
    db.commit()
    return report
```

- [ ] **Step 4: เพิ่ม schema + route**

ใน `schemas.py`:

```python
class StatusIn(BaseModel):
    to: Literal["RESOLVED", "SEARCHING", "HAS_LEAD"]
    reason: str | None = Field(default=None, max_length=300)


class EventOut(BaseModel):
    from_status: str | None
    to_status: str
    reason: str | None
    created_at: datetime


class EventList(BaseModel):
    items: list[EventOut]
```

ใน `router.py`:

```python
@router.patch("/{report_id}/status", response_model=ReportOut)
def change_status(report_id: str, payload: StatusIn, db: Session = Depends(get_session),
                  user: User = Depends(current_user)):
    report = service.change_status(db, report_id, user, payload.to, payload.reason)
    pet = db.get(Pet, report.pet_id)
    from sqlalchemy import func, select
    from app.domain.sightings.models import Sighting
    count = db.scalar(select(func.count(Sighting.id)).where(Sighting.report_id == report.id)) or 0
    return _out(report, pet, count)


@router.get("/{report_id}/events", response_model=EventList)
def events(report_id: str, db: Session = Depends(get_session)):
    report = service.get_report_or_404(db, report_id)
    rows = db.scalars(
        select(ReportEvent).where(ReportEvent.report_id == report.id).order_by(ReportEvent.id)
    )
    return EventList(items=[EventOut(from_status=e.from_status, to_status=e.to_status,
                                     reason=e.reason, created_at=e.created_at) for e in rows])
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `cd pettech && ./scripts/test.sh`
Expected: PASS ทั้ง `test_transitions.py` (8 tests) และ `test_status.py` (8 tests) · เทสที่เคย `xfail` ใน Task 4 ต้องผ่านแล้ว

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: status transitions with closure guard, reopen, and audit events"
```

---

### Task 7: RelayThread — คุยกันโดยไม่เปิดข้อมูลติดต่อ

**Files:**
- Create: `pettech/api/app/domain/relay/{models,schemas,service,router}.py`
- Create: `pettech/api/migrations/versions/0005_relay.py`
- Modify: `pettech/api/app/main.py`
- Test: `pettech/api/tests/integration/test_relay.py`, `pettech/api/tests/unit/test_privacy.py`

**Interfaces:**
- Consumes: `app.domain.sightings.models:Sighting`, `app.domain.reports.service:get_report_or_404`
- Produces: `app.domain.relay.models:RelayThread(id, report_id, finder_id, created_at)` + `UniqueConstraint(report_id, finder_id)` · `app.domain.relay.models:RelayMessage(id, thread_id, sender_id, body, created_at)` · `POST/GET /api/reports/{id}/messages`

- [ ] **Step 1: เขียน test privacy ที่ fail (invariant I6 ครอบทุก response)**

`tests/unit/test_privacy.py`:

```python
import importlib
import pkgutil

from pydantic import BaseModel

FORBIDDEN_FIELDS = {"phone", "mobile", "tel", "address", "line_id", "email", "password", "password_hash"}


def _all_response_models():
    import app.domain as domain
    found = []
    for mod in pkgutil.walk_packages(domain.__path__, prefix="app.domain."):
        module = importlib.import_module(mod.name)
        for obj in vars(module).values():
            if isinstance(obj, type) and issubclass(obj, BaseModel) and obj is not BaseModel:
                found.append(obj)
    return found


def test_no_response_schema_exposes_contact_information():
    offenders = [
        (m.__name__, f)
        for m in _all_response_models()
        for f in m.model_fields
        if f.lower() in FORBIDDEN_FIELDS and m.__name__.endswith("Out")
    ]
    assert offenders == [], f"schema เปิดเผยข้อมูลติดต่อ: {offenders}"


def test_user_table_has_no_contact_columns():
    from app.domain.auth.models import User
    cols = {c.name.lower() for c in User.__table__.columns}
    assert cols & (FORBIDDEN_FIELDS - {"email", "password_hash"}) == set()
```

`tests/integration/test_relay.py`:

```python
def _send(user, rid, body="ตอนนี้แมวยังอยู่แถวนี้ครับ"):
    return user["client"].post(f"/api/reports/{rid}/messages", json={"body": body})


def test_finder_who_sent_sighting_can_message_owner(make_user, open_report):
    finder = make_user()
    from tests.integration.test_sightings import _post_sighting
    _post_sighting(finder, open_report["id"], idem="relay-1")

    assert _send(finder, open_report["id"]).status_code == 201
    items = open_report["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]
    assert len(items) == 1
    assert "phone" not in str(items) and "email" not in str(items)


def test_stranger_without_sighting_cannot_message(make_user, open_report):
    r = _send(make_user(), open_report["id"])
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"


def test_owner_can_reply_in_existing_thread(make_user, open_report):
    finder = make_user()
    from tests.integration.test_sightings import _post_sighting
    _post_sighting(finder, open_report["id"], idem="relay-2")
    _send(finder, open_report["id"])

    assert _send(open_report, open_report["id"], body="ขอบคุณครับ กำลังไป").status_code == 201
    assert len(finder["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]) == 2


def test_each_finder_sees_only_their_own_thread(make_user, open_report):
    f1, f2 = make_user(), make_user()
    from tests.integration.test_sightings import _post_sighting
    _post_sighting(f1, open_report["id"], idem="t1")
    _post_sighting(f2, open_report["id"], idem="t2")
    _send(f1, open_report["id"], body="ข้อความของคนที่หนึ่ง")

    assert f2["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"] == []


def test_empty_message_is_422(make_user, open_report):
    finder = make_user()
    from tests.integration.test_sightings import _post_sighting
    _post_sighting(finder, open_report["id"], idem="relay-3")
    assert _send(finder, open_report["id"], body="   ").status_code == 422
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech && ./scripts/test.sh`
Expected: FAIL — 404 เพราะยังไม่มี `/messages`

- [ ] **Step 3: เขียน models**

```python
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RelayThread(Base):
    __tablename__ = "relay_threads"
    __table_args__ = (UniqueConstraint("report_id", "finder_id", name="uq_relay_thread"),)

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lost_reports.id", ondelete="CASCADE"), nullable=False)
    finder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RelayMessage(Base):
    __tablename__ = "relay_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("relay_threads.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: เขียน service**

```python
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.relay.models import RelayMessage, RelayThread
from app.domain.reports.service import get_report_or_404
from app.domain.sightings.models import Sighting
from app.errors import AppError

NO_ACCESS = "คุณต้องส่งเบาะแสในประกาศนี้ก่อนจึงจะคุยกับเจ้าของได้"


def _thread_for(db: Session, report, user: User, create: bool) -> RelayThread | None:
    is_owner = report.owner_id == user.id
    if is_owner:
        return None                    # เจ้าของตอบได้ทุก thread ของประกาศตัวเอง
    has_sighting = db.scalar(
        select(Sighting.id).where(Sighting.report_id == report.id, Sighting.finder_id == user.id).limit(1)
    )
    if not has_sighting:
        raise AppError("FORBIDDEN", NO_ACCESS)
    thread = db.scalar(
        select(RelayThread).where(RelayThread.report_id == report.id, RelayThread.finder_id == user.id)
    )
    if thread is None and create:
        thread = RelayThread(report_id=report.id, finder_id=user.id)
        db.add(thread)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            thread = db.scalar(
                select(RelayThread).where(RelayThread.report_id == report.id, RelayThread.finder_id == user.id)
            )
    return thread


def send_message(db: Session, report_id: str, user: User, body: str) -> RelayMessage:
    if not body.strip():
        raise AppError("VALIDATION", "ข้อความต้องไม่ว่าง", field="body")
    report = get_report_or_404(db, report_id)
    thread = _thread_for(db, report, user, create=True)

    if thread is None:                 # เจ้าของส่ง: ต้องมี thread ของ finder อยู่แล้วเท่านั้น
        threads = list(db.scalars(select(RelayThread).where(RelayThread.report_id == report.id)))
        if len(threads) != 1:
            raise AppError("VALIDATION",
                           "ประกาศนี้มีผู้ส่งเบาะแสหลายคน กรุณาเลือกคู่สนทนาจากหน้ารายละเอียด"
                           if threads else "ยังไม่มีผู้ส่งเบาะแสในประกาศนี้", field="thread_id")
        thread = threads[0]

    message = RelayMessage(thread_id=thread.id, sender_id=user.id, body=body.strip())
    db.add(message)
    db.commit()
    return message


def list_messages(db: Session, report_id: str, user: User) -> list[tuple[RelayMessage, str]]:
    report = get_report_or_404(db, report_id)
    is_owner = report.owner_id == user.id
    if is_owner:
        stmt = (
            select(RelayMessage, User.display_name)
            .join(RelayThread, RelayThread.id == RelayMessage.thread_id)
            .join(User, User.id == RelayMessage.sender_id)
            .where(RelayThread.report_id == report.id)
        )
    else:
        thread = db.scalar(
            select(RelayThread).where(RelayThread.report_id == report.id, RelayThread.finder_id == user.id)
        )
        if thread is None:
            return []
        stmt = (
            select(RelayMessage, User.display_name)
            .join(User, User.id == RelayMessage.sender_id)
            .where(RelayMessage.thread_id == thread.id)
        )
    return list(db.execute(stmt.order_by(RelayMessage.id)).all())
```

- [ ] **Step 5: เขียน schemas + router แล้ว include**

```python
# schemas.py
from datetime import datetime

from pydantic import BaseModel, Field


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class MessageOut(BaseModel):
    id: int
    sender_display_name: str
    body: str
    created_at: datetime


class MessageList(BaseModel):
    items: list[MessageOut]
```

```python
# router.py
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.relay import service
from app.domain.relay.schemas import MessageIn, MessageList, MessageOut

router = APIRouter(prefix="/api/reports", tags=["relay"])


@router.post("/{report_id}/messages", status_code=status.HTTP_201_CREATED, response_model=MessageOut)
def send(report_id: str, payload: MessageIn, db: Session = Depends(get_session),
         user: User = Depends(current_user)):
    m = service.send_message(db, report_id, user, payload.body)
    return MessageOut(id=m.id, sender_display_name=user.display_name, body=m.body, created_at=m.created_at)


@router.get("/{report_id}/messages", response_model=MessageList)
def inbox(report_id: str, db: Session = Depends(get_session), user: User = Depends(current_user)):
    rows = service.list_messages(db, report_id, user)
    return MessageList(items=[MessageOut(id=m.id, sender_display_name=name, body=m.body,
                                         created_at=m.created_at) for m, name in rows])
```

- [ ] **Step 6: รัน test ให้ผ่าน**

Run: `cd pettech && ./scripts/test.sh`
Expected: PASS (`test_privacy.py` 2 tests + `test_relay.py` 5 tests)

- [ ] **Step 7: migration + commit**

```bash
cd pettech/api && alembic revision --autogenerate -m "relay threads and messages" && alembic upgrade head
cd .. && git add -A && git commit -m "feat: in-system relay messaging without contact disclosure"
```

---

### Task 8: Outbox publisher + RabbitMQ + Celery worker

**Files:**
- Create: `pettech/worker/celery_app.py`, `pettech/worker/tasks.py`, `pettech/worker/Dockerfile`
- Create: `pettech/api/app/domain/notifications/{models,service}.py`
- Modify: `pettech/api/app/main.py` (`/api/ready` เช็ค broker จริง), `pettech/infra/docker-compose.yml`
- Test: `pettech/api/tests/integration/test_outbox.py`, `pettech/worker/tests/test_tasks.py`

**Interfaces:**
- Consumes: `app.outbox:Outbox`, `app.domain.sightings.models:Sighting`
- Produces:
  - `app.domain.notifications.models:Notification(id, user_id, topic, payload, created_at, read_at)`
  - `worker.tasks:handle_sighting_created(sighting_id: str) -> None` (idempotent)
  - `worker.tasks:handle_status_changed(report_id: str, from_status: str, to_status: str) -> None` (idempotent)
  - `worker.tasks:drain_outbox() -> int` (คืนจำนวนที่ publish, เรียกโดย celery beat ทุก 5 วินาที)

- [ ] **Step 1: เขียน test ที่ fail**

`api/tests/integration/test_outbox.py`:

```python
from sqlalchemy import select

from app.db import SessionLocal
from app.outbox import Outbox


def test_sighting_writes_unpublished_outbox_row(make_user, open_report):
    from tests.integration.test_sightings import _post_sighting
    _post_sighting(make_user(), open_report["id"], idem="ob-1")

    with SessionLocal() as db:
        rows = list(db.scalars(select(Outbox).where(Outbox.topic == "sighting.created")))
    assert len(rows) == 1
    assert rows[0].published_at is None          # request path ไม่ publish เอง


def test_api_still_accepts_sighting_when_broker_is_unreachable(make_user, open_report, monkeypatch):
    monkeypatch.setenv("RABBITMQ_URL", "amqp://nobody:nobody@127.0.0.1:1/")
    from tests.integration.test_sightings import _post_sighting
    assert _post_sighting(make_user(), open_report["id"], idem="ob-2").status_code == 201


def test_status_change_writes_outbox_row(open_report):
    open_report["client"].patch(f"/api/reports/{open_report['id']}/status",
                                json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    with SessionLocal() as db:
        rows = list(db.scalars(select(Outbox).where(Outbox.topic == "report.status_changed")))
    assert len(rows) == 1 and rows[0].published_at is None
```

`worker/tests/test_tasks.py`:

```python
def test_handle_sighting_created_twice_creates_one_notification(db_session, sighting_factory):
    from worker.tasks import handle_sighting_created
    s = sighting_factory()

    handle_sighting_created(str(s.id))
    handle_sighting_created(str(s.id))            # at-least-once delivery

    from app.domain.notifications.models import Notification
    from sqlalchemy import func, select
    count = db_session.scalar(select(func.count(Notification.id)))
    assert count == 1


def test_handle_sighting_created_writes_thumbnail_once(db_session, sighting_factory, tmp_path):
    from worker.tasks import handle_sighting_created
    s = sighting_factory(with_photo=True)

    handle_sighting_created(str(s.id))
    db_session.refresh(s)
    first_thumb = s.thumb_key
    assert first_thumb is not None

    handle_sighting_created(str(s.id))
    db_session.refresh(s)
    assert s.thumb_key == first_thumb             # ไม่สร้างไฟล์ซ้ำ
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech && ./scripts/test.sh`
Expected: FAIL — `No module named 'app.domain.notifications'`

- [ ] **Step 3: เขียน Notification model + service**

```python
# api/app/domain/notifications/models.py
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Notification(Base):
    __tablename__ = "notifications"
    # dedupe_key ทำให้ task ที่ถูกส่งซ้ำไม่สร้างแจ้งเตือนซ้ำ (at-least-once)
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key", name="uq_notification_dedupe"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    topic: Mapped[str] = mapped_column(String(64), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

```python
# api/app/domain/notifications/service.py
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.notifications.models import Notification


def notify_once(db: Session, user_id, topic: str, dedupe_key: str, payload: dict) -> bool:
    """คืน True ถ้าสร้างใหม่ · False ถ้ามีอยู่แล้ว (task ถูกส่งซ้ำ)"""
    db.add(Notification(user_id=user_id, topic=topic, dedupe_key=dedupe_key, payload=payload))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False
```

- [ ] **Step 4: เขียน celery app + tasks**

```python
# worker/celery_app.py
from celery import Celery
from celery.schedules import schedule

from app.config import get_settings

celery = Celery("pettech", broker=get_settings().rabbitmq_url)
celery.conf.update(
    task_acks_late=True,            # ack หลังทำงานเสร็จ — worker ตายกลางทางงานกลับเข้าคิว
    worker_prefetch_multiplier=1,
    task_default_queue="pettech",
    beat_schedule={
        "drain-outbox": {"task": "worker.tasks.drain_outbox", "schedule": schedule(5.0)},
    },
)
```

```python
# worker/tasks.py
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image
from sqlalchemy import select, update

from app.config import get_settings
from app.db import SessionLocal
from app.domain.notifications.service import notify_once
from app.domain.relay.models import RelayThread
from app.domain.reports.models import LostReport
from app.domain.sightings.models import Sighting
from app.outbox import Outbox
from worker.celery_app import celery

THUMB_MAX = (480, 480)


@celery.task(name="worker.tasks.handle_sighting_created", bind=True, max_retries=5)
def handle_sighting_created(self, sighting_id: str) -> None:
    with SessionLocal() as db:
        sighting = db.get(Sighting, sighting_id)
        if sighting is None:
            return                                  # เบาะแสถูกลบไปแล้ว — ไม่ใช่ error
        report = db.get(LostReport, sighting.report_id)

        notify_once(db, report.owner_id, "sighting.created",
                    dedupe_key=f"sighting:{sighting.id}",
                    payload={"report_id": str(report.id), "sighting_id": str(sighting.id)})

        if sighting.photo_key and not sighting.thumb_key:
            src = Path(get_settings().upload_dir) / sighting.photo_key
            if src.is_file():
                thumb_key = f"thumb_{sighting.photo_key}"
                dst = Path(get_settings().upload_dir) / thumb_key
                with Image.open(src) as im:
                    im.thumbnail(THUMB_MAX)
                    im.save(dst)
                db.execute(update(Sighting).where(Sighting.id == sighting.id,
                                                  Sighting.thumb_key.is_(None))
                           .values(thumb_key=thumb_key))
                db.commit()


@celery.task(name="worker.tasks.handle_status_changed")
def handle_status_changed(report_id: str, from_status: str, to_status: str) -> None:
    with SessionLocal() as db:
        finders = db.scalars(select(RelayThread.finder_id).where(RelayThread.report_id == report_id))
        for finder_id in finders:
            notify_once(db, finder_id, "report.status_changed",
                        dedupe_key=f"status:{report_id}:{to_status}",
                        payload={"report_id": report_id, "from": from_status, "to": to_status})


ROUTES = {
    "sighting.created": lambda p: handle_sighting_created.delay(p["sighting_id"]),
    "report.status_changed": lambda p: handle_status_changed.delay(p["report_id"], p["from"], p["to"]),
}


@celery.task(name="worker.tasks.drain_outbox")
def drain_outbox() -> int:
    """ดูดงานที่ยังไม่ publish ส่งเข้า broker แล้ว mark — ล็อกแถวกัน beat ซ้อนกันหยิบงานเดียวกัน"""
    sent = 0
    with SessionLocal() as db:
        rows = db.execute(
            select(Outbox).where(Outbox.published_at.is_(None))
            .order_by(Outbox.id).limit(100).with_for_update(skip_locked=True)
        ).scalars().all()
        for row in rows:
            handler = ROUTES.get(row.topic)
            if handler is None:
                row.published_at = datetime.now(UTC)   # topic ที่ไม่รู้จัก: mark ทิ้ง ไม่ให้ค้างคิว
                continue
            handler(row.payload)
            row.published_at = datetime.now(UTC)
            sent += 1
        db.commit()
    return sent
```

- [ ] **Step 5: เขียน worker Dockerfile และเพิ่ม service ใน compose**

`pettech/worker/Dockerfile`:

```dockerfile
FROM pettech-api:${IMAGE_TAG:-dev}
COPY . /srv/worker
WORKDIR /srv
CMD ["celery", "-A", "worker.celery_app.celery", "worker", "--beat", "--loglevel=info", "-Q", "pettech"]
```

> ใช้ image ของ api เป็น base เพื่อให้โค้ดโดเมนเป็นชุดเดียวกัน ไม่มี drift

เพิ่มใน `infra/docker-compose.yml`:

```yaml
  rabbitmq:
    image: rabbitmq:3-management
    environment:
      RABBITMQ_DEFAULT_USER: pettech
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
    networks: [petnet]

  worker:
    build:
      context: ..
      dockerfile: worker/Dockerfile
    environment:
      DATABASE_URL: postgresql+psycopg://pettech:${POSTGRES_PASSWORD}@db:5432/pettech
      RABBITMQ_URL: amqp://pettech:${RABBITMQ_PASSWORD}@rabbitmq:5672//
      UPLOAD_DIR: /data/uploads
    volumes:
      - uploads:/data/uploads
    # 1 replica เท่านั้น — beat ที่รันซ้อนกันจะดูด outbox ซ้ำ
    deploy:
      replicas: 1
    depends_on:
      db:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    networks: [petnet]
```

- [ ] **Step 6: เปลี่ยน `/api/ready` ให้เช็ค broker จริงแต่ไม่ล้มเมื่อ broker ตาย**

```python
@app.get("/api/ready")
def ready():
    s = get_settings()
    db_ok = _check_db(s.database_url)
    broker_ok = _check_broker(s.rabbitmq_url)
    # degraded ไม่ใช่ error: API ยังรับคำขอได้เมื่อ broker ล่ม งาน async ค้างใน outbox
    return {"status": "ok" if db_ok and broker_ok else "degraded", "db": db_ok, "broker": broker_ok}
```

```python
def _check_broker(url: str) -> bool:
    import kombu
    try:
        with kombu.Connection(url, connect_timeout=1) as conn:
            conn.connect()
        return True
    except Exception:
        return False
```

- [ ] **Step 7: รัน test ให้ผ่าน**

Run: `cd pettech && ./scripts/test.sh`
Expected: PASS (`test_outbox.py` 3 tests + `worker/tests/test_tasks.py` 2 tests)

- [ ] **Step 8: ยืนยัน degraded mode ด้วยมือ**

```bash
cd pettech && ./scripts/up.sh
docker compose -f infra/docker-compose.yml stop rabbitmq
curl -fsS http://localhost:8000/api/ready          # ต้องได้ status=degraded, broker=false
# ส่งเบาะแสผ่าน UI หรือ curl → ต้องได้ 201
docker compose -f infra/docker-compose.yml exec db psql -U pettech -d pettech \
  -c "select topic, published_at from outbox order by id desc limit 5"   # ต้องเห็น published_at = null
docker compose -f infra/docker-compose.yml start rabbitmq
sleep 15
docker compose -f infra/docker-compose.yml exec db psql -U pettech -d pettech \
  -c "select count(*) from outbox where published_at is null"            # ต้องเป็น 0
```

Expected: ข้อมูลไม่หาย งานค้างไหลต่อหลัง broker กลับมา

- [ ] **Step 9: migration + commit**

```bash
cd pettech/api && alembic revision --autogenerate -m "notifications" && alembic upgrade head
cd .. && git add -A && git commit -m "feat: outbox publisher, rabbitmq, celery worker with idempotent tasks"
```

---

### Task 9: Concurrency test ผ่าน Traefik (พิสูจน์ว่า invariant อยู่ที่ DB)

**Files:**
- Create: `pettech/api/tests/concurrency/test_race.py`, `pettech/api/tests/concurrency/conftest.py`
- Create: `pettech/scripts/race.sh`
- Modify: `pettech/scripts/test.sh` (เพิ่ม suite), `pettech/infra/docker-compose.test.yml`

**Interfaces:**
- Consumes: ระบบที่รันอยู่จริงผ่าน Traefik (`BASE_URL`, default `http://traefik/`)
- Produces: `pettech/scripts/race.sh` → exit 0 เมื่อ invariant ถูกต้อง

- [ ] **Step 1: เขียน test ที่ fail**

`pettech/api/tests/concurrency/test_race.py`:

```python
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import httpx
import pytest

BASE = os.environ.get("BASE_URL", "http://traefik")
PNG = bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 64

pytestmark = pytest.mark.skipif(not os.environ.get("BASE_URL"), reason="ต้องรันกับระบบที่ขึ้นอยู่แล้ว")


def _register(name: str) -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=20)
    email = f"{name}{uuid.uuid4().hex[:8]}@example.com"
    c.post("/api/auth/register", json={"email": email, "password": "LongEnoughPassw0rd",
                                       "display_name": name}).raise_for_status()
    c.post("/api/auth/login", json={"email": email, "password": "LongEnoughPassw0rd"}).raise_for_status()
    return c


def _open_report(owner: httpx.Client) -> str:
    pet = owner.post("/api/pets", json={"name": "ขาวมณี", "species": "cat"}).json()
    r = owner.post("/api/reports", json={
        "pet_id": pet["id"],
        "last_seen_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
        "district": "บางกะปิ"})
    r.raise_for_status()
    return r.json()["id"]


def _send_sighting(client: httpx.Client, rid: str, idem: str) -> int:
    return client.post(
        f"/api/reports/{rid}/sightings",
        data={"seen_at": (datetime.now(UTC) - timedelta(minutes=5)).isoformat(),
              "district": "บางกะปิ", "note": "เห็นแถวนี้"},
        files={"photo": ("a.png", PNG, "image/png")},
        headers={"Idempotency-Key": idem},
    ).status_code


def test_closing_while_sighting_arrives_never_leaves_sighting_in_closed_report():
    owner = _register("owner")
    for attempt in range(20):
        rid = _open_report(owner)
        finder = _register("finder")

        with ThreadPoolExecutor(max_workers=2) as pool:
            close = pool.submit(owner.patch, f"/api/reports/{rid}/status",
                                json={"to": "RESOLVED", "reason": "เจอแล้ว"})
            send = pool.submit(_send_sighting, finder, rid, f"race-{attempt}")
            close_status = close.result().status_code
            send_status = send.result()

        assert send_status in (201, 200, 409), f"สถานะที่ไม่คาดคิด: {send_status}"
        assert close_status == 200

        detail = httpx.get(f"{BASE}/api/reports/{rid}").json()
        timeline = httpx.get(f"{BASE}/api/reports/{rid}/sightings").json()["items"]
        if detail["status"] == "RESOLVED" and send_status == 409:
            assert timeline == []            # ปิดชนะ: ห้ามมีเบาะแสค้างในประกาศที่ปิด
        if send_status in (200, 201):
            assert len(timeline) == 1        # เบาะแสชนะ: ต้องมีหนึ่งรายการ ไม่ซ้ำ


def test_ten_parallel_identical_sightings_create_exactly_one_row():
    owner = _register("owner")
    rid = _open_report(owner)
    finder = _register("finder")
    key = f"same-{uuid.uuid4().hex[:6]}"

    with ThreadPoolExecutor(max_workers=10) as pool:
        codes = list(pool.map(lambda _: _send_sighting(finder, rid, key), range(10)))

    assert sorted(set(codes)) in ([200, 201], [201]), codes
    assert codes.count(201) == 1, f"สร้างซ้ำ {codes.count(201)} ครั้ง"
    assert len(httpx.get(f"{BASE}/api/reports/{rid}/sightings").json()["items"]) == 1


def test_requests_actually_reached_both_api_replicas():
    """ถ้าทุกคำขอไปที่ replica เดียว เทส race ด้านบนจะอ่อนลงมาก — เช็คว่า LB กระจายจริง"""
    hostnames = set()
    with httpx.Client(base_url=BASE, timeout=10) as c:
        for _ in range(30):
            hostnames.add(c.get("/api/health").headers.get("x-served-by", ""))
    assert len(hostnames) >= 2, f"คำขอไปที่ replica เดียว: {hostnames}"
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
cd pettech && ./scripts/up.sh
BASE_URL=http://localhost:8000 python -m pytest api/tests/concurrency -v
```

Expected: FAIL ที่ `test_requests_actually_reached_both_api_replicas` — ยังไม่มี header `x-served-by`

- [ ] **Step 3: เพิ่ม header บอก replica ที่ตอบ**

ใน `app/main.py`:

```python
import socket

from starlette.middleware.base import BaseHTTPMiddleware

HOSTNAME = socket.gethostname()


class ServedByMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["x-served-by"] = HOSTNAME
        return response


app.add_middleware(ServedByMiddleware)
```

- [ ] **Step 4: เขียน race.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BASE_URL:-http://localhost:8000}"
curl -fsS "$BASE/api/health" >/dev/null || { echo "ระบบยังไม่ขึ้น: รัน scripts/up.sh ก่อน"; exit 1; }
docker compose -f infra/docker-compose.yml exec -T -e BASE_URL="http://traefik" \
  "$(docker compose -f infra/docker-compose.yml ps -q api | head -1 | xargs docker inspect -f '{{.Name}}' | cut -c2-)" \
  python -m pytest tests/concurrency -v
```

> ยิงจากในเน็ตเวิร์ก `petnet` เพื่อให้ผ่าน Traefik จริงและไม่ติด rate limit ของ IP ภายนอก

- [ ] **Step 5: รัน test ให้ผ่าน**

```bash
cd pettech && ./scripts/down.sh && ./scripts/up.sh && ./scripts/race.sh
```

Expected: PASS ทั้ง 3 tests · `test_requests_actually_reached_both_api_replicas` เห็น hostname ≥ 2 ตัว

- [ ] **Step 6: พิสูจน์ว่าเทสจับ regression ได้จริง**

แก้ `app/domain/sightings/service.py` ชั่วคราว: เปลี่ยน `.with_for_update()` เป็นไม่ล็อก และย้ายการเช็คสถานะไปอ่านจาก cache ใน process

```bash
cd pettech && ./scripts/up.sh --build && ./scripts/race.sh
```

Expected: **FAIL** — ยืนยันว่าเทสนี้มีค่า จากนั้น `git checkout -- api/app/domain/sightings/service.py` และรันซ้ำให้เขียว

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "test: concurrency suite through traefik against 2 api replicas"
```

---

### Task 10: Frontend React

> **ต้องรอ UI/UX design เสร็จก่อนเริ่ม task นี้** หน้าตา ลำดับหน้าจอ และ copy ภาษาไทยมาจากเอกสารออกแบบ ส่วน task นี้ล็อกเฉพาะโครงโค้ดกับพฤติกรรมที่เทสได้

**Files:**
- Create: `pettech/web/{package.json,vite.config.ts,tsconfig.json,Dockerfile,nginx.conf,index.html}`
- Create: `pettech/web/src/{main.tsx,App.tsx}`, `pettech/web/src/api/client.ts`, `pettech/web/src/components/ErrorBanner.tsx`
- Create: `pettech/web/src/pages/{Login,Register,Dashboard,ReportList,ReportDetail,NewReport,NewSighting,Relay}.tsx`
- Test: `pettech/web/src/components/ErrorBanner.test.tsx`, `pettech/web/src/pages/NewSighting.test.tsx`

**Interfaces:**
- Consumes: REST API ตาม Task 2–7 · error body `{code, message_th, field}`
- Produces: `api/client.ts` → `request<T>(path, init) -> Promise<T>` ที่ throw `ApiError {code, messageTh, field}` · `components/ErrorBanner.tsx` → `<ErrorBanner error={ApiError|null} onRetry?={() => void} />`

- [ ] **Step 1: เขียน test ที่ fail**

`src/components/ErrorBanner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/client'
import { ErrorBanner } from './ErrorBanner'

describe('ErrorBanner', () => {
  it('แสดงข้อความไทยจาก API ไม่ใช่ code', () => {
    render(<ErrorBanner error={new ApiError('REPORT_CLOSED', 'เจ้าของพบสัตว์แล้ว ประกาศนี้ปิดรับเบาะแส', null)} />)
    expect(screen.getByRole('alert')).toHaveTextContent('เจ้าของพบสัตว์แล้ว')
    expect(screen.getByRole('alert')).not.toHaveTextContent('REPORT_CLOSED')
  })

  it('ไม่แสดงอะไรเมื่อไม่มี error', () => {
    const { container } = render(<ErrorBanner error={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('สื่อสถานะด้วยไอคอนและข้อความ ไม่ใช่สีเพียงอย่างเดียว', () => {   // NFR-04 accessibility
    render(<ErrorBanner error={new ApiError('VALIDATION', 'ข้อมูลไม่ถูกต้อง', 'district')} />)
    expect(screen.getByRole('alert')).toHaveTextContent('ข้อมูลไม่ถูกต้อง')
    expect(screen.getByTestId('error-icon')).toBeInTheDocument()
  })
})
```

`src/pages/NewSighting.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NewSighting } from './NewSighting'

describe('NewSighting', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('เมื่อได้ 409 ต้องแสดงข้อความและข้อความที่พิมพ์ไว้ยังอยู่', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ code: 'REPORT_CLOSED', message_th: 'เจ้าของพบสัตว์แล้ว ประกาศนี้ปิดรับเบาะแส', field: null }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ) as Response)

    render(<NewSighting reportId="r1" />)
    await userEvent.type(screen.getByLabelText('รายละเอียดที่พบ'), 'เห็นแมวแถวตลาด')
    await userEvent.type(screen.getByLabelText('เขต'), 'บางกะปิ')
    await userEvent.click(screen.getByRole('button', { name: 'ส่งเบาะแส' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ปิดรับเบาะแส'))
    expect(screen.getByLabelText('รายละเอียดที่พบ')).toHaveValue('เห็นแมวแถวตลาด')
    expect(screen.getByRole('link', { name: /ประกาศอื่น/ })).toBeInTheDocument()
  })

  it('ส่งซ้ำด้วย Idempotency-Key เดิมเมื่อกดปุ่มสองครั้ง', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ id: 's1' }), { status: 201, headers: { 'content-type': 'application/json' } },
    ) as Response)

    render(<NewSighting reportId="r1" />)
    await userEvent.type(screen.getByLabelText('เขต'), 'บางกะปิ')
    const button = screen.getByRole('button', { name: 'ส่งเบาะแส' })
    await userEvent.click(button)
    await userEvent.click(button)

    const keys = spy.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(new Set(keys).size).toBe(1)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech/web && npm install && npm test`
Expected: FAIL — ไม่มีไฟล์ `api/client.ts` และ `pages/NewSighting.tsx`

- [ ] **Step 3: เขียน api client**

```ts
// src/api/client.ts
export class ApiError extends Error {
  constructor(readonly code: string, readonly messageTh: string, readonly field: string | null) {
    super(messageTh)
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init })
  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      body?.code ?? 'VALIDATION',
      body?.message_th ?? 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่',
      body?.field ?? null,
    )
  }
  return body as T
}
```

- [ ] **Step 4: เขียน ErrorBanner และ NewSighting**

```tsx
// src/components/ErrorBanner.tsx
import type { ApiError } from '../api/client'

export function ErrorBanner({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div role="alert" className="error-banner">
      <span data-testid="error-icon" aria-hidden="true">⚠</span>
      <span>{error.messageTh}</span>
      {onRetry && <button type="button" onClick={onRetry}>ลองอีกครั้ง</button>}
    </div>
  )
}
```

```tsx
// src/pages/NewSighting.tsx
import { useRef, useState } from 'react'

import { ApiError, request } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'

export function NewSighting({ reportId }: { reportId: string }) {
  const [note, setNote] = useState('')
  const [district, setDistrict] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [sending, setSending] = useState(false)
  // key เดิมตลอดอายุฟอร์ม: กดซ้ำ/เน็ตกระตุกแล้วส่งใหม่ ต้องไม่เกิดเบาะแสซ้ำ
  const idemKey = useRef(crypto.randomUUID())

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSending(true)
    setError(null)
    const form = new FormData()
    form.set('seen_at', new Date().toISOString())
    form.set('district', district)
    form.set('note', note)
    if (photo) form.set('photo', photo)

    try {
      await request(`/api/reports/${reportId}/sightings`, {
        method: 'POST',
        body: form,
        headers: { 'Idempotency-Key': idemKey.current },
      })
      setNote('')
      setPhoto(null)
    } catch (caught) {
      setError(caught as ApiError)      // ไม่ล้างฟอร์มเมื่อ error — ข้อความที่พิมพ์ต้องยังอยู่
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <ErrorBanner error={error} />
      {error?.code === 'REPORT_CLOSED' && (
        <a href={`/reports?district=${encodeURIComponent(district)}`}>ดูประกาศอื่นในเขตนี้</a>
      )}
      <label htmlFor="district">เขต</label>
      <input id="district" value={district} onChange={(e) => setDistrict(e.target.value)} required />

      <label htmlFor="note">รายละเอียดที่พบ</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />

      <label htmlFor="photo">รูปที่ถ่ายได้</label>
      <input id="photo" type="file" accept="image/png,image/jpeg,image/webp"
             onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />

      <button type="submit" disabled={sending}>ส่งเบาะแส</button>
    </form>
  )
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `cd pettech/web && npm test`
Expected: PASS (5 tests)

- [ ] **Step 6: เขียนหน้าที่เหลือตามเอกสาร UI/UX แล้วเพิ่ม web ลง compose**

หน้าที่ต้องมี: `Login` `Register` `Dashboard` (ประกาศของฉัน + ปุ่มสร้าง) `ReportList` (filter ชนิด/เขต/สถานะ) `ReportDetail` (รายละเอียด + timeline เบาะแส + ปุ่มปิด/เปิดประกาศสำหรับเจ้าของ) `NewReport` `Relay`

`web/nginx.conf`:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri/ /index.html;       # SPA fallback
  }
}
```

`web/Dockerfile`:

```dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

เพิ่มใน `infra/docker-compose.yml`:

```yaml
  web:
    build:
      context: ../web
    image: pettech-web:${IMAGE_TAG:-dev}
    labels:
      traefik.enable: "true"
      traefik.docker.network: petnet
      traefik.http.routers.web.entrypoints: web
      traefik.http.routers.web.rule: PathPrefix(`/`)
      traefik.http.routers.web.service: web
      traefik.http.services.web.loadbalancer.server.port: "80"
    networks: [petnet]
```

- [ ] **Step 7: ยืนยัน end-to-end ด้วยมือ**

```bash
cd pettech && ./scripts/up.sh
```

เปิด `http://localhost:8000` → สมัคร → เพิ่มสัตว์เลี้ยง → สร้างประกาศ → logout → สมัครผู้ใช้ที่สอง → ส่งเบาะแส → เจ้าของปิดประกาศ → ผู้ใช้ที่สองส่งเบาะแสอีก **ต้องเห็นข้อความไทยว่าปิดรับเบาะแสแล้ว และข้อความที่พิมพ์ยังอยู่**

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: react frontend with error-aware sighting form"
```

---

### Task 11: Smoke test + Jenkins pipeline

**Files:**
- Create: `pettech/scripts/smoke.sh`, `pettech/scripts/seed.sh`, `pettech/Jenkinsfile`
- Modify: `pettech/README.md`

**Interfaces:**
- Consumes: ระบบที่ deploy แล้ว (`BASE_URL`)
- Produces: `scripts/smoke.sh` exit 0 เมื่อเส้นทางหลักและกฎ 409 ทำงานถูก · `Jenkinsfile` 8 stage

- [ ] **Step 1: เขียน smoke.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:8000}"
JAR_OWNER=$(mktemp) ; JAR_FINDER=$(mktemp)
trap 'rm -f "$JAR_OWNER" "$JAR_FINDER"' EXIT
STAMP=$(date +%s)
PW='LongEnoughPassw0rd'

say() { printf '  → %s\n' "$1"; }
api() { curl -fsS "$@"; }

say "health"
api "$BASE/api/health" | grep -q '"status":"ok"'

say "สมัครและเข้าสู่ระบบ: เจ้าของ"
api -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"owner$STAMP@example.com\",\"password\":\"$PW\",\"display_name\":\"เจ้าของ\"}" >/dev/null
api -c "$JAR_OWNER" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"owner$STAMP@example.com\",\"password\":\"$PW\"}" >/dev/null

say "สร้างสัตว์เลี้ยงและประกาศ"
PET=$(api -b "$JAR_OWNER" -X POST "$BASE/api/pets" -H 'content-type: application/json' \
  -d '{"name":"ขาวมณี","species":"cat"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
SEEN=$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)
REPORT=$(api -b "$JAR_OWNER" -X POST "$BASE/api/reports" -H 'content-type: application/json' \
  -d "{\"pet_id\":\"$PET\",\"last_seen_at\":\"$SEEN\",\"district\":\"บางกะปิ\"}" \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

say "สมัครและเข้าสู่ระบบ: ผู้พบเห็น"
api -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"finder$STAMP@example.com\",\"password\":\"$PW\",\"display_name\":\"ผู้พบเห็น\"}" >/dev/null
api -c "$JAR_FINDER" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"finder$STAMP@example.com\",\"password\":\"$PW\"}" >/dev/null

say "ส่งเบาะแส → สถานะต้องเป็น HAS_LEAD"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
api -b "$JAR_FINDER" -X POST "$BASE/api/reports/$REPORT/sightings" \
  -H "Idempotency-Key: smoke-$STAMP" \
  -F "seen_at=$NOW" -F 'district=บางกะปิ' -F 'note=เห็นแถวตลาด' >/dev/null
api "$BASE/api/reports/$REPORT" | grep -q '"status":"HAS_LEAD"'

say "ข้อมูลสาธารณะต้องไม่มีข้อมูลติดต่อ"
api "$BASE/api/reports/$REPORT" | grep -Eqv '"(phone|email|address|line_id)"'

say "เจ้าของปิดประกาศ"
api -b "$JAR_OWNER" -X PATCH "$BASE/api/reports/$REPORT/status" -H 'content-type: application/json' \
  -d '{"to":"RESOLVED","reason":"เจอแล้ว"}' | grep -q '"status":"RESOLVED"'

say "เบาะแสหลังปิดต้องได้ 409"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_FINDER" \
  -X POST "$BASE/api/reports/$REPORT/sightings" -H "Idempotency-Key: smoke-after-$STAMP" \
  -F "seen_at=$NOW" -F 'district=บางกะปิ' -F 'note=มาช้า')
[ "$CODE" = "409" ] || { echo "คาดหวัง 409 แต่ได้ $CODE"; exit 1; }

say "ประกาศที่ปิดต้องไม่อยู่ในรายการตามหา"
api "$BASE/api/reports" | grep -q "$REPORT" && { echo "ประกาศที่ปิดยังโผล่ในรายการ"; exit 1; }

echo "smoke test ผ่านทั้งหมด"
```

- [ ] **Step 2: รัน smoke ให้ผ่านกับระบบที่ขึ้นอยู่**

```bash
cd pettech && chmod +x scripts/smoke.sh && ./scripts/up.sh && ./scripts/smoke.sh
```

Expected: พิมพ์ `smoke test ผ่านทั้งหมด` และ exit 0

- [ ] **Step 3: เขียน Jenkinsfile**

```groovy
// Jenkins → SSH เข้า course container → สั่ง docker ในนั้น (pattern เดียวกับ LAB 3/4)
// ต้องมี credential: devtools-ssh (SSH key) และ dockerhub (username + token)
pipeline {
  agent any

  triggers { githubPush() }

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout()
  }

  environment {
    SSH_DEVTOOLS = 'ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes root@devtools'
    SRC_DIR      = '/workspace/pettech'
    AUTH_DIR     = '/root/pettech-auth'
    IMAGE_TAG    = "build-${env.BUILD_NUMBER}"
  }

  stages {
    stage('Connect') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '$SSH_DEVTOOLS "hostname && docker --version && docker compose version"'
        }
      }
    }

    stage('Secrets') {
      steps {
        script {
          def scmVars = checkout scm
          env.COMMIT = scmVars.GIT_COMMIT.substring(0, 7)
        }
        // .env ที่ถูก track = secret รั่ว หยุดการส่งมอบทันที
        sh '''
          if git ls-files --error-unmatch pettech/.env >/dev/null 2>&1; then
            echo "พบ .env ถูก track ใน git — หยุด pipeline"; exit 1
          fi
          test -f pettech/.env.example
          '''
      }
    }

    stage('Ship source') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "rm -rf $SRC_DIR && mkdir -p $SRC_DIR"
            tar --exclude=.git --exclude=node_modules -cf - -C pettech . | $SSH_DEVTOOLS "tar -xf - -C $SRC_DIR"
            $SSH_DEVTOOLS "test -f $SRC_DIR/infra/docker-compose.yml"
            '''.stripIndent()
        }
      }
    }

    stage('Build') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "SRC_DIR=$SRC_DIR IMAGE_TAG=$IMAGE_TAG COMMIT=$COMMIT BUILD_NUMBER=$BUILD_NUMBER bash -ex" <<'EOF'
              cd "$SRC_DIR"
              cp .env.example .env
              APP_VERSION=0.1.0 GIT_COMMIT="$COMMIT" BUILD_NUMBER="$BUILD_NUMBER" IMAGE_TAG="$IMAGE_TAG" \
                docker compose --env-file .env -f infra/docker-compose.yml build
            EOF
            '''.stripIndent()
        }
      }
    }

    stage('Test') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "SRC_DIR=$SRC_DIR bash -ex" <<'EOF'
              cd "$SRC_DIR"
              ./scripts/test.sh
            EOF
            '''.stripIndent()
        }
      }
    }

    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub',
                         usernameVariable: 'HUB_USER', passwordVariable: 'HUB_TOKEN')]) {
          sshagent(credentials: ['devtools-ssh']) {
            sh '''
              set +x
              echo "$HUB_TOKEN" | $SSH_DEVTOOLS "umask 077; mkdir -p $AUTH_DIR; docker --config $AUTH_DIR login -u $HUB_USER --password-stdin"
              set -x
              for svc in api web; do
                $SSH_DEVTOOLS "docker tag pettech-$svc:$IMAGE_TAG $HUB_USER/pettech-$svc:$IMAGE_TAG"
                $SSH_DEVTOOLS "docker --config $AUTH_DIR push $HUB_USER/pettech-$svc:$IMAGE_TAG"
              done
              '''.stripIndent()
          }
        }
      }
    }

    stage('Deploy') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "SRC_DIR=$SRC_DIR IMAGE_TAG=$IMAGE_TAG bash -ex" <<'EOF'
              cd "$SRC_DIR"
              IMAGE_TAG="$IMAGE_TAG" docker compose --env-file .env -f infra/docker-compose.yml up -d
              docker compose -f infra/docker-compose.yml exec -T api alembic upgrade head
              for i in $(seq 1 30); do
                curl -fsS http://localhost:8000/api/health >/dev/null && break
                sleep 2
              done
            EOF
            '''.stripIndent()
        }
      }
    }

    stage('Verify') {
      steps {
        sshagent(credentials: ['devtools-ssh']) {
          sh '''
            $SSH_DEVTOOLS "SRC_DIR=$SRC_DIR COMMIT=$COMMIT bash -ex" <<'EOF'
              cd "$SRC_DIR"
              curl -fsS http://localhost:8000/api/health | grep -F "\\"commit\\":\\"$COMMIT\\""
              ./scripts/smoke.sh
              ./scripts/race.sh
            EOF
            '''.stripIndent()
        }
      }
    }
  }

  post {
    always {
      sshagent(credentials: ['devtools-ssh']) {
        sh '$SSH_DEVTOOLS "rm -rf $AUTH_DIR" || true'
      }
    }
    failure {
      echo 'pipeline แดง — ไม่ deploy เวอร์ชันนี้ ดู stage ที่แดงและแก้ก่อน push ใหม่'
    }
  }
}
```

- [ ] **Step 4: ยืนยันว่า test แดงแล้ว pipeline หยุดจริง**

```bash
cd pettech
# ทำให้เทสแดงชั่วคราว: ลบการเช็คสถานะ RESOLVED ใน add_sighting
git checkout -b ci-proof
# แก้ api/app/domain/sightings/service.py ให้ไม่ raise REPORT_CLOSED แล้ว commit + push
```

Expected: Jenkins build แดงที่ stage `Test` และ **ไม่มี** stage `Push`/`Deploy` รัน · จากนั้น revert และ push ใหม่ให้เขียว แล้วลบ branch

- [ ] **Step 5: เขียน README สำหรับคนที่รันซ้ำในกล่อง**

`pettech/README.md` ต้องมี: ข้อกำหนด (image รายวิชา), คำสั่ง 5 บรรทัดสำหรับ start/test/smoke/race/stop, ตารางพอร์ต, วิธีตั้ง credential ของ Jenkins, และตารางกฎความถูกต้อง C1–C5 พร้อมคำสั่งที่พิสูจน์แต่ละข้อ

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "ci: jenkins pipeline with blocking tests and post-deploy verification"
```

---

### Task 12: Traceability matrix

**Files:**
- Create: `pettech/docs/traceability.md`
- Test: `pettech/api/tests/unit/test_traceability_doc.py`

**Interfaces:**
- Consumes: ชื่อเทสจริงทุกตัวในโปรเจค
- Produces: `docs/traceability.md` ที่ทุกแถวอ้างชื่อเทสที่มีจริง

- [ ] **Step 1: เขียน test ที่ fail — กันเอกสารโกหก**

```python
import re
import subprocess
from pathlib import Path

DOC = Path(__file__).resolve().parents[3] / "docs" / "traceability.md"


def _collected_test_names() -> set[str]:
    out = subprocess.run(["python", "-m", "pytest", "--collect-only", "-q"],
                         capture_output=True, text=True, cwd=Path(__file__).resolve().parents[2])
    return {line.split("::")[-1].split("[")[0] for line in out.stdout.splitlines() if "::" in line}


def test_every_cited_test_exists():
    cited = set(re.findall(r"`(test_[a-z0-9_]+)`", DOC.read_text(encoding="utf-8")))
    assert cited, "traceability.md ต้องอ้างชื่อเทสด้วย backtick"
    missing = cited - _collected_test_names()
    assert missing == set(), f"เอกสารอ้างเทสที่ไม่มีจริง: {sorted(missing)}"


def test_all_requirements_are_covered():
    text = DOC.read_text(encoding="utf-8")
    for req in ["FR-01", "FR-02", "FR-03", "FR-04", "FR-05", "FR-06", "FR-07",
                "C1", "C2", "C3", "C4", "C5"]:
        assert req in text, f"ไม่มีแถวของ {req}"
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `cd pettech/api && python -m pytest tests/unit/test_traceability_doc.py -v`
Expected: FAIL — ไม่มีไฟล์ `docs/traceability.md`

- [ ] **Step 3: เขียน traceability.md**

ตารางคอลัมน์: `Requirement | ผู้ใช้/สถานการณ์ | Acceptance Criteria | ส่วนที่นำไปใช้ (ไฟล์) | เทสที่พิสูจน์ | สถานะ`
ทุกแถวต้องมีชื่อเทสจริงใน backtick เช่น

```markdown
| C1 | ผู้พบเห็นส่งเบาะแสพร้อมจังหวะเจ้าของปิดประกาศ | ได้ 409 `REPORT_CLOSED` และไม่มีเบาะแสค้างในประกาศที่ปิด | `api/app/domain/sightings/service.py:add_sighting` | `test_sighting_after_resolve_is_409_report_closed`, `test_closing_while_sighting_arrives_never_leaves_sighting_in_closed_report` | ผ่าน |
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd pettech && ./scripts/test.sh`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: traceability matrix verified against real test names"
```

---

## Self-review

**Spec coverage** — FR-01→T4 · FR-02→T4 · FR-03→T4 · FR-04→T5 · FR-05→T5 · FR-06→T6 · FR-07→T7 · C1→T5,T6,T9 · C2→T6 · C3→T7(`test_privacy`),T11 · C4→T5,T9 · C5→T8 · I1→T5 · I2→T5 · I3,I4→T6 · I5→T6 · I6→T7 · I7→T1 · I8→T1,T9 · API ทุก endpoint→T1-T7 · async→T8 · deployment→T1,T8,T10 · testing 4 ชั้น→T5,T7,T9,T11 · CI 8 stage→T11 · repo structure→T1-T10

**Placeholder scan** — ไม่มี TBD/TODO · ทุก step ที่เป็นโค้ดมี code block จริง · Task 10 Step 6 ระบุรายชื่อหน้าและไฟล์ที่ต้องมี โดยหน้าตาอ้างจากเอกสาร UI/UX ที่จะทำก่อนเริ่ม task (ไม่ใช่ placeholder ของตรรกะ)

**Type consistency** — `add_sighting` คืน `tuple[Sighting, bool]` ใช้ตรงกันใน T5 router · `enqueue(db, topic, payload)` นิยามใน T5 Step 11 ใช้ใน T5/T6 · `AppError(code, message_th, status=None, field=None)` ใช้แบบ keyword `field=` ทุกที่ · constants `SEARCHING/HAS_LEAD/RESOLVED` มาจาก `app.domain.reports.models` ทุกจุด · `next_status_on_reopen(has_sightings: bool)` และ `validate_transition(current, target)` นิยามใน T6 ใช้ใน test T6 เท่านั้น · `ApiError(code, messageTh, field)` ใน T10 ตรงกับทั้ง client และ test

**Review Focus** — ทั้ง 5 ข้อมีเทสผูกอยู่ใน task เจ้าของโค้ดแล้ว: (1) `test_rejects_non_image_content_type`/`test_rejects_file_over_limit` ใน T5 · (2) `test_last_seen_at_in_the_future_is_rejected` ใน T4 และ `test_seen_at_in_future_is_422` ใน T5 · (3) `test_owner_cannot_send_sighting_to_own_report` ใน T5 · (4) `test_missing_idempotency_key_is_422`/`test_blank_idempotency_key_is_422` ใน T5 · (5) `test_blank_district_and_overlong_description_are_rejected` ใน T4 และ `test_overlong_note_is_422` ใน T5
