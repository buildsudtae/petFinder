# ADR 0001 — การเลือก Tech Stack ของ Lost Pet Finder

- **สถานะ:** Accepted
- **วันที่:** 2026-10-03
- **บริบท:** Mini Project PetTech × DevTools · ทีม 4 คน · ตรวจใน `tuchsanai/devtools:2569_1` (Docker-in-Docker, node เดียว)

---

## บริบทการตัดสินใจ

รายวิชาสอนเครื่องมือไว้มากกว่าที่ระบบหนึ่งระบบต้องใช้: Git, Docker/Compose, Docker Swarm, Traefik (reverse proxy / LB / API gateway / canary / forward proxy), RabbitMQ, Kafka, Jenkins, Kubernetes, Plane และเปิดทางเลือก Prometheus/Grafana

ข้อกำหนดของโครงการระบุชัดว่า **"ไม่พิจารณาจากจำนวนเครื่องมือ แต่พิจารณาจากเหตุผลที่เลือก ความถูกต้องของ Integration และผลที่ตรวจสอบได้"** ดังนั้นการใส่เครื่องมือที่อธิบายเหตุผลไม่ได้คือความเสียหาย ไม่ใช่กำไร

ลักษณะงานจริงของระบบนี้:

- ปริมาณข้อความ async ระดับไม่กี่ข้อความต่อนาที consumer กลุ่มเดียว ไม่ต้อง replay event ย้อนหลัง
- ความเสี่ยงหลักคือ **ความถูกต้องเมื่อมีการแข่งกันเขียน** (เบาะแสเข้าพร้อมจังหวะปิดประกาศ, ส่งซ้ำ) ไม่ใช่ throughput หรือ capacity
- ทำงานบน node เดียวเสมอ และ environment ที่ใช้ตรวจคือ Docker Compose ในกล่องรายวิชา

---

## การตัดสินใจ

### ใช้

| เครื่องมือ | เหตุผลที่ระบบนี้ต้องมี |
|---|---|
| **PostgreSQL 17** | Invariant หลักของระบบ (I1 เบาะแสห้ามเข้าประกาศที่ปิด, I2 ส่งซ้ำได้แถวเดียว) บังคับด้วย `SELECT … FOR UPDATE` + unique constraint ภายใน transaction เดียว ฐานข้อมูลที่เขียนพร้อมกันไม่ได้ (เช่น SQLite) จะดัน invariant ขึ้นไปอยู่ในโค้ดแอป ซึ่งนำ race condition กลับมา |
| **FastAPI (Python 3.12)** | Celery worker ใช้ domain model ร่วมกับ API จึงต้องเป็นภาษาเดียวกัน · Pydantic ให้ validation error ระบุ field ตรงกับ error contract ที่ออกแบบไว้ |
| **React + Vite** | ฟอร์มส่งเบาะแสต้องรักษาข้อความที่ผู้ใช้พิมพ์ไว้เมื่อได้ 409 และ timeline ต้องอัปเดตหลังส่ง — ต้องมี client state |
| **nginx (static)** | เสิร์ฟ build ที่นิ่งแล้ว ไม่ต้องมี Node ตอน runtime → image เล็ก พื้นผิวโจมตีน้อย |
| **Docker + Compose** | ข้อกำหนดของโครงการ และเป็น runtime ที่กรรมการใช้ตรวจในกล่อง |
| **Alembic** | ข้อมูลต้องอยู่รอดเมื่อสร้าง container ใหม่ (I7) → schema เปลี่ยนแบบมีเวอร์ชัน ไม่ใช่ `create_all()` |
| **Traefik v3.7.4** | (1) เปิดพอร์ตเดียวจากกล่องรายวิชา (2) origin เดียว → ไม่มี CORS → เก็บ JWT ใน cookie `httpOnly` ได้ ปลอดภัยกว่า localStorage (3) load balance `api` 2 replica (4) middleware `rateLimit` กันสแปมเบาะแสที่ชั้น gateway ไม่ต้องเขียนในแอป (5) ค้นพบ service จาก Docker label → เพิ่ม/ลด service ไม่ต้องแก้ไฟล์ config |
| **RabbitMQ + Celery** | ย่อรูปที่อัปโหลดกิน CPU ระดับหลายร้อยมิลลิวินาทีถึงวินาที ต้องไม่อยู่ใน request path · แจ้งเตือน fan-out ไปหา finder หลายคนต่อประกาศ · broker ให้ ack / retry / DLQ และรัน worker ขนานได้ |
| **Jenkins** | ข้อกำหนดของโครงการ และใช้ pattern ที่สอน (Jenkins → SSH → course container) เพื่อให้ตรวจซ้ำได้ในกล่อง |

### ไม่ใช้

| เครื่องมือ | เหตุผลที่ตัด |
|---|---|
| **Kafka** | ออกแบบมาเพื่อ throughput สูง, การเก็บ log ย้อนหลัง และ replay ซึ่งระบบนี้ไม่มีความต้องการเลย · งานของเราเป็น task queue ที่ RabbitMQ (ack ต่อข้อความ, retry, DLQ) ตรงกว่า · ใส่ทั้งสองตัวคือการเพิ่มจำนวนเครื่องมือโดยไม่มีเหตุผลรองรับ |
| **Kubernetes** | กล่องรายวิชาเป็น Docker-in-Docker การรัน kind/k3d เพิ่ม container อีกชั้นและเพิ่มความเสี่ยงว่ากรรมการรันไม่ขึ้น · บน node เดียว K8s ไม่ทำให้ระบบถูกต้องหรือทนทานขึ้น · สิ่งที่ถูกตรวจคือ Compose |
| **Docker Swarm** | เป็น orchestration หลาย node แต่ระบบรันบน node เดียวเสมอ |
| **Traefik canary / mirroring** | ต้องมีสองเวอร์ชันพร้อมกันและนโยบายแบ่ง traffic ที่ต้องดูแล โดยไม่มีปัญหาจริงรองรับ (ใช้ LB + rateLimit ซึ่งมีของจริงรองรับแทน) |
| **Prometheus / Grafana** | ความเสี่ยงของระบบคือความถูกต้องตอนแข่งกันเขียน ไม่ใช่ capacity · ใช้ structured JSON log + `/api/ready` + healthcheck ของ Compose เพียงพอ · เพิ่ม 2 container และ dashboard ที่ไม่ตอบคำถามความเสี่ยงหลัก |
| **Plane** | เป็นเครื่องมือจัดการงานของทีม ไม่ใช่องค์ประกอบของระบบที่ส่งมอบ (ใช้ติดตามงานได้ แต่ไม่นับเป็น architecture) |
| **MinIO / S3** | named volume `uploads` เพียงพอ · object storage เพิ่ม secret และ config ที่ต้องดูแลโดยไม่ได้ความสามารถที่ต้องการกลับมา |
| **Redis** | ไม่มีข้อมูลที่ต้อง cache ที่ขนาดนี้ · ไม่มี session ฝั่ง server (JWT ใน cookie) · broker ใช้ RabbitMQ แล้ว |

---

## ทางเลือกที่พิจารณาแล้วไม่เลือก

**1. nginx ตัวเดียวทำทั้ง static และ reverse proxy (ไม่ใช้ Traefik)**
ได้ origin เดียวเหมือนกันและลด container ลงหนึ่งตัว แต่ต้องแก้ไฟล์ `nginx.conf` ทุกครั้งที่เพิ่ม/ลด service, ไม่มี rate limit ที่ตั้งผ่าน label, ไม่มี dashboard ตรวจ routing และไม่มี load balancing ให้ใช้ทันที — ตัดสินใจรับ container เพิ่มหนึ่งตัวเพื่อแลกกับสิ่งเหล่านี้

**2. ตัด RabbitMQ ใช้ `outbox` ใน Postgres เป็นคิวเดียว**
ตารางเดียวทำได้จริงและลด container ไปสองตัว แต่ต้องเขียน retry, backoff, การล็อกแถวให้ worker หลายตัวไม่หยิบงานซ้ำ และ dead-letter ด้วยมือทั้งหมด ซึ่งเขียนผิดง่ายกว่าการใช้ broker ที่มีให้แล้ว
→ **ตัดสินใจใช้ทั้งคู่โดยแบ่งหน้าที่ชัดเจน: `outbox` รับประกันว่าข้อความไม่หายเมื่อ broker ล่ม (atomic กับ transaction ธุรกิจ) · RabbitMQ รับผิดชอบ delivery, retry และการรัน worker ขนาน**

**3. api replica เดียว**
ง่ายกว่า แต่ทำให้เหตุผลการใช้ Traefik เหลือแค่ routing และที่สำคัญกว่าคือ **ไม่ได้ทดสอบว่า invariant อยู่ที่ฐานข้อมูลจริง** — ถ้ามี process เดียว การย้าย lock ไปไว้ในหน่วยความจำของ process ก็ยังผ่านเทส
→ **ตัดสินใจรัน 2 replica และยิง concurrency test ผ่าน Traefik** เพื่อให้เทสแดงถ้าใครเผลอย้าย invariant ออกจาก DB

---

## ผลที่ตามมา

**ได้:**
- Invariant ทั้งหมดบังคับที่ชั้นฐานข้อมูล และมีเทสที่พิสูจน์ข้อนี้ข้ามหลาย process
- request path ไม่มีงานช้าและไม่พึ่งพา broker — broker ล่มระบบยังรับงานได้ ข้อมูลไม่หาย
- เหตุผลของทุกเครื่องมือตอบได้ด้วยความต้องการของระบบ ไม่ใช่ด้วยรายวิชา

**เสีย / ต้องยอมรับ:**
- 7 service ใน Compose (traefik, web, api ×2, db, rabbitmq, worker) — มากกว่าระบบ 3 ชั้นธรรมดา ต้องมี healthcheck และลำดับ `depends_on` ที่ถูกต้อง ไม่งั้นสตาร์ตไม่ขึ้นในกล่อง
- `worker` ต้องเป็น replica เดียวเพราะ `celery beat` ที่รันซ้อนจะดูด `outbox` ซ้ำ — ถ้าจะ scale worker ต้องแยก beat เป็น service ของตัวเองก่อน
- งาน async เป็น at-least-once ทุก task ต้องเขียนให้ idempotent
- ไม่มี metric ย้อนหลัง (ไม่มี Prometheus) — ถ้าต้องวินิจฉัยปัญหาเชิงประสิทธิภาพในอนาคตต้องเพิ่มภายหลัง
