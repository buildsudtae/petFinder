# Design Spec — Lost Pet Finder

วันที่: 2026-10-03 · สถานะ: รอทบทวน · โดเมนอ้างอิง: [CONTEXT.md](../CONTEXT.md)

---

## 1. ขอบเขต

ระบบเว็บสำหรับประกาศสัตว์เลี้ยงหาย รับเบาะแสจากผู้พบเห็น และติดตามสถานะจนปิดเรื่อง

**ในขอบเขต:** auth · จัดการ pet · สร้าง/ค้นหา/ดูประกาศ · ส่ง/ดูเบาะแส · เปลี่ยนสถานะประกาศ · คุยในระบบโดยไม่เปิดข้อมูลติดต่อ · แจ้งเตือนแบบ async · อัปโหลดและย่อรูป

**นอกขอบเขต (ตัดทิ้งแบบตั้งใจ):** geo radius/PostGIS · AI/LLM จับคู่รูป · Kubernetes · payment · mobile app · guest sighting (ผู้พบเห็นต้องสมัครก่อน) · ไมโครชิป/ทะเบียนสัตว์ · การจองคิวคลินิก

**Known limitation:** ผู้พบเห็นต้อง register/login ก่อนส่งเบาะแส ซึ่งเพิ่ม friction กับคนที่เดินผ่านมาเจอสัตว์ — ยอมรับเพื่อให้ FR-07 (คุยกันโดยไม่เปิดเบอร์) และการกันสแปมทำได้จริง

---

## 2. Tech stack

| ชั้น | เลือกใช้ | เหตุผล |
|---|---|---|
| Frontend | React (Vite) + TypeScript, build เป็น static เสิร์ฟด้วย nginx | เบา ไม่ต้องรัน node ตอน runtime |
| Backend | FastAPI + SQLAlchemy 2.x + Alembic (Python 3.12) | ตรงกับที่สอน + async-ready |
| Database | PostgreSQL 17 | invariant ระดับ DB (unique, transaction, row lock) |
| Gateway | Traefik v3.7.4 | ทางเข้าเดียว → ไม่มี CORS → ใช้ cookie httpOnly ได้ · **load balance `api` 2 replica** · middleware `rateLimit` กันสแปมเบาะแสที่ชั้น gateway |
| Broker/Worker | RabbitMQ 3 (management) + Celery (worker + beat) | แยกงานที่ผู้ใช้ไม่ต้องรอ (แจ้งเตือน, ย่อรูป) |
| CI/CD | Jenkins declarative pipeline → SSH เข้า course container | ตาม pattern ที่สอน (LAB 3/4) |
| Runtime | Docker Compose ใน `tuchsanai/devtools:2569_1` | environment ที่ใช้ตรวจ |

---

## 3. Data model

```sql
users(id uuid pk, email text unique not null, password_hash text not null,
      display_name text not null, created_at timestamptz default now())
-- ไม่มีคอลัมน์ phone / address / line_id โดยเจตนา (privacy by schema)

pets(id uuid pk, owner_id uuid fk→users not null, name text not null,
     species text not null, color text, marks text, photo_key text,
     created_at timestamptz default now())

lost_reports(id uuid pk, pet_id uuid fk→pets not null, owner_id uuid fk→users not null,
     status text not null check (status in ('SEARCHING','HAS_LEAD','RESOLVED')),
     last_seen_at timestamptz not null, district text not null, area_note text,
     description text, created_at timestamptz default now(), resolved_at timestamptz)

sightings(id uuid pk, report_id uuid fk→lost_reports not null,
     finder_id uuid fk→users not null, photo_key text, thumb_key text,
     seen_at timestamptz not null, district text not null, area_note text, note text,
     idem_key text not null, created_at timestamptz default now(),
     unique (report_id, finder_id, idem_key))

report_events(id bigserial pk, report_id uuid fk not null, actor_id uuid fk,
     from_status text, to_status text not null, reason text,
     created_at timestamptz default now())

relay_threads(id uuid pk, report_id uuid fk not null, finder_id uuid fk not null,
     created_at timestamptz default now(), unique (report_id, finder_id))

relay_messages(id bigserial pk, thread_id uuid fk not null, sender_id uuid fk not null,
     body text not null, created_at timestamptz default now())

outbox(id bigserial pk, topic text not null, payload jsonb not null,
     created_at timestamptz default now(), published_at timestamptz)
```

**Index:** `lost_reports(status, district)` สำหรับ FR-02 · `sightings(report_id, created_at desc)` สำหรับ FR-05 · `outbox(published_at) where published_at is null`

### Invariants

| # | Invariant | บังคับด้วย |
|---|---|---|
| I1 | เบาะแสเข้าได้เฉพาะประกาศที่ยังไม่ `RESOLVED` | `SELECT ... FOR UPDATE` + เช็ค status ใน transaction เดียวกับ INSERT |
| I2 | เบาะแสซ้ำจาก key เดิม = แถวเดิม | `unique(report_id, finder_id, idem_key)` + จับ IntegrityError คืนตัวเดิม |
| I3 | สถานะเดินได้เฉพาะ `SEARCHING→HAS_LEAD→RESOLVED` และ reopen `RESOLVED→SEARCHING\|HAS_LEAD` (บังคับ reason) | validate ในชั้น service + บันทึก `report_events` ทุกครั้ง |
| I4 | `HAS_LEAD` ตั้งโดยระบบเท่านั้น เจ้าของตั้งเองไม่ได้ — มีเบาะแสแรก → `HAS_LEAD` · reopen แล้วมีเบาะแสอยู่ → กลับไป `HAS_LEAD` ไม่ใช่ `SEARCHING` (สถานะต้องไม่โกหก timeline) | service layer ปฏิเสธ `to=HAS_LEAD` จาก API และคำนวณเองตอน reopen |
| I5 | เฉพาะ owner ของ report เปลี่ยนสถานะ/อ่าน relay ของตนได้ | authorization check ก่อน query, คืน 403 |
| I6 | ไม่มี response ใดคืนข้อมูลติดต่อ | schema ไม่มีคอลัมน์ + unit test assert key ที่ห้ามมี |
| I7 | ข้อมูลอยู่รอดเมื่อสร้าง container ใหม่ | named volume `pgdata`, `uploads` |
| I8 | `api` ต้อง stateless — ไม่เก็บ state ในหน่วยความจำหรือดิสก์ของตัวเอง (ไฟล์อัปโหลดลง volume ที่ share) | รัน 2 replica หลัง Traefik ได้โดยไม่ต้อง sticky session (JWT ไม่มี state ฝั่ง server) |

---

## 4. API

Auth = JWT ใน cookie `httpOnly; SameSite=Strict; Secure` (dev ปิด Secure), อายุ 12 ชม.

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `/api/auth/register` | public | email + password + display_name |
| POST | `/api/auth/login` | public | ผิดช่องไหนไม่บอก คืนข้อความรวม |
| POST | `/api/auth/logout` | user | ล้าง cookie |
| GET | `/api/me` | user | |
| GET/POST | `/api/pets` | user | pet ของตัวเองเท่านั้น |
| POST | `/api/reports` | owner ของ pet | สร้างประกาศ status=`SEARCHING` |
| GET | `/api/reports` | public | filter `species, district, status`, pagination `limit/cursor` · **ไม่ส่ง `status` มา = คืนเฉพาะ `SEARCHING`+`HAS_LEAD`** (ประกาศที่ปิดแล้วต้องไม่โผล่ในรายการตามหา ตาม FR-06) ส่ง `status=RESOLVED` เพื่อดูย้อนหลังได้ |
| GET | `/api/reports/{id}` | public | ไม่มีข้อมูลติดต่อเจ้าของ |
| PATCH | `/api/reports/{id}/status` | owner | `{to: RESOLVED\|SEARCHING, reason}` |
| POST | `/api/reports/{id}/sightings` | user | header `Idempotency-Key` บังคับ · multipart (รูป) |
| GET | `/api/reports/{id}/sightings` | public | เรียง `created_at` |
| GET | `/api/reports/{id}/events` | owner | ประวัติสถานะ + เหตุผล (ข้อความอิสระของเจ้าของ จึงไม่เปิดสาธารณะ) · 401 ไม่ login, 403 ไม่ใช่เจ้าของ |
| POST | `/api/reports/{id}/messages` | owner หรือ finder ที่ส่งเบาะแสแล้ว | สร้าง thread ให้อัตโนมัติถ้ายังไม่มี |
| GET | `/api/reports/{id}/messages` | participant | |
| GET | `/api/health` | public | `{status, version, commit, build}` — มาจาก build arg `APP_VERSION/GIT_COMMIT/BUILD_NUMBER` ที่ pipeline ใส่ตอน `docker build` (ใช้ยืนยันว่า deploy ไปแล้วคือ commit ที่ test ผ่าน) |
| GET | `/api/ready` | public | เช็ค db + broker, ใช้กับ healthcheck |

### Error contract

ทุก error คืน `{"code": str, "message_th": str, "field": str|null}`

| code | HTTP | เงื่อนไข |
|---|---|---|
| `REPORT_CLOSED` | 409 | ส่งเบาะแสเข้าประกาศที่ `RESOLVED` |
| `FORBIDDEN` | 403 | ไม่ใช่เจ้าของ / ไม่ใช่ participant — **ไม่คืน payload ของ resource** |
| `VALIDATION` | 422 | ข้อมูลไม่ครบ/ผิดรูปแบบ (ระบุ field) |
| `NOT_FOUND` | 404 | resource ไม่มี |
| `AUTH_REQUIRED` | 401 | ไม่มี/หมดอายุ cookie |
| `INVALID_TRANSITION` | 409 | เปลี่ยนสถานะผิดลำดับ (เช่น `to=HAS_LEAD`) |

### เส้นทางสำคัญ: POST sighting

```
BEGIN
  SELECT id, status FROM lost_reports WHERE id = :id FOR UPDATE
  ถ้าไม่พบ                → ROLLBACK, 404
  ถ้า status = 'RESOLVED'  → ROLLBACK, 409 REPORT_CLOSED
  INSERT INTO sightings (...)
      IntegrityError (I2)  → ROLLBACK, SELECT แถวเดิม, 200
  ถ้า status = 'SEARCHING' → UPDATE → 'HAS_LEAD'
                             INSERT report_events(from, to='HAS_LEAD', actor=null)
  INSERT INTO outbox('sighting.created', {...})
COMMIT  → 201
```

Worker ไม่ถูกเรียกใน request path เลย — `celery beat` ดูด `outbox` ที่ `published_at IS NULL` ทุก 5 วินาที ส่งเข้า RabbitMQ แล้ว mark published (at-least-once; task ต้อง idempotent)

### เส้นทาง: PATCH status

```
BEGIN
  SELECT ... FOR UPDATE
  ถ้า owner_id != current_user  → 403 FORBIDDEN
  ถ้า to ไม่อยู่ใน {RESOLVED, SEARCHING}        → 409 INVALID_TRANSITION
  ถ้า to == status                              → 409 INVALID_TRANSITION
  ถ้า to == 'SEARCHING' และ reason ว่าง          → 422 VALIDATION
  UPDATE status, resolved_at
  INSERT report_events(from, to, reason, actor)
  INSERT outbox('report.status_changed', {...})
COMMIT → 200
```

---

## 5. งาน async

| topic | worker ทำอะไร | ต้อง idempotent เพราะ |
|---|---|---|
| `sighting.created` | บันทึก notification ให้เจ้าของ + ย่อรูปเป็น thumbnail (Pillow) เขียน `thumb_key` | at-least-once delivery |
| `report.status_changed` | แจ้ง finder ทุกคนใน thread ของประกาศนั้น | at-least-once delivery |

Degraded mode: RabbitMQ หรือ worker ตาย → API ยังรับคำขอได้ปกติ งานค้างใน `outbox` และไหลต่อเมื่อกลับมา (ไม่มีข้อมูลสูญหาย)

---

## 6. Deployment

```
traefik (8000:80, 8080 dashboard)
 ├── PathPrefix(/api) → api × 2 replica   (uvicorn, no stripprefix — route มี /api อยู่แล้ว)
 │                      + middleware rateLimit
 └── PathPrefix(/)    → web               (nginx เสิร์ฟ React build)
api, worker  → db (pgdata volume), rabbitmq, uploads volume (shared)
```

- `api` ตั้ง `deploy.replicas: 2` · **ห้ามตั้ง `container_name`** และ **ห้าม publish port** (Traefik เป็นทางเข้าเดียว) → Traefik round-robin ให้เอง เป็น load balancing จริงไม่ใช่ของประดับ
- `worker` (celery worker + beat) ต้องเป็น **replica เดียว** เพราะ beat ที่รันซ้อนจะดูด `outbox` ซ้ำ — ถ้าจะ scale worker ให้แยก beat ออกเป็น service ของตัวเอง
- `docker-compose.yml` = production · `docker-compose.test.yml` = override สำหรับรัน test (db แยก, ไม่ expose port)
- healthcheck: db `pg_isready` · rabbitmq `rabbitmq-diagnostics ping` · api `GET /api/ready` · `depends_on: condition: service_healthy`
- rateLimit: `traefik.http.middlewares.api-rl.ratelimit.average=20` / `burst=40` ต่อ IP — ให้ใช้งานปกติไม่สะดุด แต่กันการยิงเบาะแสรัวๆ
- secret: `.env` ไม่ commit (`.gitignore`) · commit `.env.example` · pipeline fail ถ้า `.env` ถูก track
- migration: `alembic upgrade head` รันเป็น step ตอน deploy ไม่ใช่ตอน import app
- `scripts/`: `up.sh` `down.sh` `test.sh` `smoke.sh` `seed.sh` `race.sh`

---

## 7. Testing

| ชั้น | ครอบคลุม |
|---|---|
| unit | state machine (I3,I4) · serializer assert ไม่มี key `phone/email/address` (I6) · idempotency key |
| integration (postgres จริง) | happy path FR-01..07 · 409 REPORT_CLOSED · 403 cross-owner · ส่งซ้ำได้ id เดิม · reopen บังคับ reason |
| concurrency | thread A ปิดประกาศ + thread B ส่งเบาะแส พร้อมกัน → ผลเป็น 201 หรือ 409 เท่านั้น และไม่มีเบาะแสในประกาศที่ปิด · ยิงเบาะแส key เดิม 10 ครั้งขนาน → ได้ 1 แถว · **ยิงผ่าน Traefik (ไม่ใช่ยิงตรงที่ api)** เพื่อให้คำขอกระจายไป 2 replica จริง — ทดสอบว่า invariant อยู่ที่ DB ไม่ใช่ที่ process (ถ้าใครย้าย lock มาไว้ใน memory ของ process เทสนี้จะแดง) |
| smoke (ผ่าน Traefik หลัง deploy) | `/api/health` → register → login → สร้างประกาศ → ส่งเบาะแส → ปิด → ส่งอีกต้องได้ 409 |
| frontend | render error banner จาก `code` ที่ API คืน (409/403/422) + form state ไม่หาย |

---

## 8. CI/CD

Jenkins declarative, trigger `githubPush()`, pattern ตาม LAB 3/4 (Jenkins → SSH → course container):

```
Connect  ssh เข้า devtools, เช็ค docker/git
Secrets  fail ถ้า .env ถูก track ใน git
Clone    ship source (tar ผ่าน ssh, ไม่รวม .git) + เก็บ commit sha
Build    docker compose build (api, web)
Test     compose -f docker-compose.test.yml up -d db → alembic → pytest ในคอนเทนเนอร์ api → down -v
Push     docker login --password-stdin → tag + push (เฉพาะเมื่อ Test ผ่าน)
Deploy   compose pull + up -d + alembic upgrade head
Verify   scripts/smoke.sh ผ่าน Traefik — ไม่ผ่าน = build แดง
```

`disableConcurrentBuilds()` เพราะใช้พอร์ตและโฟลเดอร์เดียวกัน · `post { always { cleanup } }`

---

## 9. โครงสร้าง repo

```
api/           app/{main,deps,config}.py  domain/{reports,sightings,relay,auth}/
               migrations/  tests/{unit,integration,concurrency}/  Dockerfile
web/           src/{pages,components,api,hooks}/  Dockerfile  nginx.conf
worker/        celery_app.py  tasks.py          (ใช้ image เดียวกับ api)
infra/         docker-compose.yml  docker-compose.test.yml  traefik/
scripts/       up.sh down.sh test.sh smoke.sh seed.sh race.sh
docs/          CONTEXT.md  specs/  traceability.md
Jenkinsfile    .env.example  .gitignore
```

แยกโดเมนเป็นโฟลเดอร์ต่อ bounded context — แต่ละโดเมนมี `router.py` (HTTP), `service.py` (business rule + transaction), `models.py`, `schemas.py` เพื่อให้ business rule ทดสอบได้โดยไม่ผ่าน HTTP

---

## 10. ลำดับการสร้าง

1. skeleton: compose (db+api+web+traefik) + health + CI stage Build/Test ว่างๆ ให้เขียวก่อน
2. auth + users (cookie JWT)
3. pets + reports CRUD + FR-02 filter
4. sightings + I1/I2 + integration & concurrency test (ชิ้นที่ยากสุด ทำตอนยังมีเวลา)
5. status transition + report_events (I3/I4/I5)
6. relay thread + messages (I6)
7. outbox + rabbitmq + worker + thumbnail
8. smoke script + pipeline ครบ 8 stage
9. traceability matrix
