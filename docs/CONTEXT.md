# CONTEXT.md — PetTech × DevTools Mini Project

เอกสารกลางของโดเมน + ข้อจำกัด (source of truth สำหรับคำศัพท์และข้อผูกพัน)
อัปเดต: 2026-10-03

---

## 1. ข้อจำกัดจากรายวิชา (hard constraints)

| หัวข้อ | ค่า | ที่มา |
|---|---|---|
| ทีม | 4 คน (Sec1 ทุกกลุ่ม 4, Sec3 กลุ่ม 8 = 3 คน) | `Mini_Project/readme.md` |
| นำเสนอ | 10 นาที demo + 5 นาที Q&A (สัปดาห์สุดท้ายก่อนสอบปลายภาค) | `Mini_Project/readme.md` |
| Test environment ที่ใช้ตัดสิน | **ในกล่องรายวิชาเท่านั้น** image `tuchsanai/devtools:2569_1` (Docker-in-Docker) | spec §3 |
| กล่องมีอะไร | Ubuntu 26.04, docker-ce 29 + compose + buildx, Python3+uv, Node 24, git+gh, SSH(22), workdir `/workspace`, รันเป็น root | `00_Tool/01_Reference/readme.md` |
| องค์ประกอบบังคับ | (1) Requirement+Acceptance Criteria ตรวจได้ (2) ระบบใช้งานจริง Web+DB+Backend end-to-end (3) Git/GitHub + กัน secret (4) Docker/Compose ทำซ้ำได้ แยก config/data ออกจาก image (5) Jenkins CI/CD + automated verification + post-deploy verify (6) System design/integration/operability + error/security/privacy/external-failure | spec §2.1 |
| ตัวเลือกเสริม | Traefik, RabbitMQ, Kafka, Prometheus, Grafana, Kubernetes — **ให้คะแนนที่เหตุผลการเลือก + ความถูกต้องของ integration ไม่ใช่จำนวนเครื่องมือ** | spec §2.1 |
| LLM | ไม่ใช้ = ไม่เสียคะแนน แต่ถ้าเคลมว่ามี ต้องโชว์ prompt flow, guardrail, fallback, secret handling และผ่าน acceptance | spec §2.3, §7.7 |

### Evidence Gates ที่ต้องผ่านตอน present (spec §5.3)
1. **Claim Gate** — ทุกคำเคลม → Requirement → Acceptance Criteria ที่ตรวจได้
2. **Live System Gate** — happy path **และ failure case** รันจาก version ที่ส่งจริง
3. **Architecture Gate** — diagram ต้องตรงกับ runtime จริง
4. **Reproducibility Gate** — start/test/stop/ตรวจซ้ำได้ในกล่องรายวิชา
5. **Ownership Gate** — สมาชิก **ทุกคน** อธิบาย decision + trace data flow + วินิจฉัย defect ในส่วนตัวเองได้

> กฎเหล็กของอาจารย์: "ทุกสิ่งที่ทีมเสนอว่าระบบทำได้ จะกลายเป็น Acceptance Criteria" → **เคลมน้อย ทำให้ครบ ดีกว่าเคลมเยอะแล้วโชว์ไม่ได้**

### มิติให้คะแนน (spec §7)
7.1 Problem Statement · 7.2 Solution · 7.3 Target Users/Market · 7.4 Social Impact · 7.5 Team & Network · 7.6 Sustainability & Unfair Advantage · **7.7 Demo/DevTools/System Design (น้ำหนักเวลามากสุด)**

---

## 2. Stack ที่สอนในห้อง (ของจริงที่มี lab ให้ลอก pattern ได้)

| หมวด | ที่สอน | path ใน repo |
|---|---|---|
| Git | basics, workflow/remote, branch/merge/worktree, undo (restore/revert/reset) | `01_GIT/` |
| Docker | run/port/volume/build, Dockerfile+layer cache, RUN/CMD/ENTRYPOINT, compose | `02_Docker/01,02` |
| Fullstack ตัวอย่าง | PostgreSQL lab, Fullstack compose (api/web/db Dockerfile), **Lost_Pet_Finder lab**, **Example_Pet_Clinic_Design (เฉลยของอาจารย์)** | `02_Docker/03_Fullstack_App_Example/` |
| Gateway | Traefik: reverse proxy, load balancing, API gateway middlewares, canary/mirroring, capstone, forward proxy, compose anatomy | `03_Application_Docker/01_Traefik.../` |
| Broker | RabbitMQ, Kafka | `03_Application_Docker/02_Message_Brokers/` |
| Agile/PM | Plane (self-host): work items, scrum, kanban, REST API, webhooks, dashboard | `03_Application_Docker/05_Plane/` |
| CI/CD | Jenkins on Docker, declarative pipeline, docker build+push, **webhook trigger** | `04_Jenkins/001_Jenikin/` |
| K8s | basics, networking/config/storage, application deployment | `05_kubernetes/` |

**ผลสำคัญ:** Vet appointment booking = เฉลยของอาจารย์ (`Example_Pet_Clinic_Design`) และ Lost Pet Finder = LAB 003 → **สองหัวข้อนี้คือ "ของที่ให้ดูเป็นตัวอย่าง" ไม่ใช่ที่ทางสร้างความต่าง**

---

## 3. หลักฐานปัญหา (internet research, 2026-10-03)

| ข้อเท็จจริง | ตัวเลข | แหล่ง |
|---|---|---|
| หมา-แมวจรจัดในไทย | ~3.6 ล้านตัว (สุนัข 2.49 ล้าน สำรวจ 2562 + แมว ~1 ล้าน) | mgronline, Chula |
| คนถูกสุนัขกัดต่อปี | > 1 ล้านคน | กรมควบคุมโรค |
| ตลาดสัตว์เลี้ยงไทย | 9.2 หมื่นล้านบาท ปี 2568 (+13.2%) คาดทะลุ 1 แสนล้าน ปี 2569 | ttb analytics |
| บริการสุขภาพสัตว์ | 6.99 พันล้านบาท ปี 2568 โตเฉลี่ย 17.9%/6 ปี | ttb analytics |
| ค่าใช้จ่าย/ตัว/ปี | pet humanization 50,500 บาท vs ทั่วไป 7,910 บาท | ttb analytics |
| ความต้องการบริการ | 65% อยาก Pet Wellness Center ครบวงจร, 40% อยากคลินิกเฉพาะทาง | สำรวจตลาด |
| **ข้อบัญญัติ กทม. เรื่องการควบคุมการเลี้ยงหรือปล่อยสัตว์ พ.ศ. 2567** | ต้อง **จดทะเบียน + ฝังไมโครชิป**: ภายใน 120 วันหลังเกิด หรือ 30 วันหลังนำมาเลี้ยง · เดิมบังคับใช้ 10 ม.ค. 2569 · **กทม. เลื่อนออกไป 1 ปี** เพราะเอกสารซับซ้อน/จุดฝังชิปไม่พร้อม/กลัวคนทิ้งสัตว์ | bangkokbiznews, posttoday, dailynews |

**ช่องว่างที่ยังไม่มีใครแก้:** ตัวข้อบัญญัติถูกเลื่อน *เพราะกระบวนการลงทะเบียนและจุดบริการฝังชิปยังไม่พร้อม* — นี่คือ root cause เชิง operational ไม่ใช่เชิงกฎหมาย

---

## 4. คำศัพท์โดเมน (ใช้ให้ตรงกันทุกที่: code, API, slide, traceability matrix)

| คำ | ความหมายในระบบนี้ | ห้ามสับสนกับ |
|---|---|---|
| **Pet** | สัตว์เลี้ยงหนึ่งตัว ผูกกับ Owner หนึ่งราย | Animal (สัตว์ที่ยังไม่รู้เจ้าของ) |
| **Owner** | ผู้ใช้ที่ login แล้วและเป็นเจ้าของ Pet — คนเดียวที่แก้ LostReport ของตัวเองได้ | User (รวม Finder ที่ login) |
| **Finder** | ผู้พบเห็น — ส่ง Sighting ได้ **ไม่ต้องเป็นเจ้าของ pet ใด** | Owner |
| **LostReport** | ประกาศสัตว์หาย 1 ใบ ต่อ 1 ครั้งที่หาย — เจ้าของเป็นผู้สร้าง | Pet (pet ตัวเดียวหายได้หลายครั้ง = หลาย LostReport) |
| **ReportStatus** | สถานะของ LostReport: `SEARCHING` (กำลังตามหา) · `HAS_LEAD` (มีเบาะแส) · `RESOLVED` (พบแล้ว) | SightingStatus |
| **Sighting** | เบาะแส 1 รายการที่ Finder ส่งเข้า LostReport — มีรูป ตำแหน่ง เวลา ข้อความ | LostReport |
| **SightingArea** | บริเวณที่พบ (เขต/ย่าน + พิกัดหยาบ) — **ไม่ใช่ที่อยู่บ้านเจ้าของ** | HomeAddress (ไม่เก็บ ไม่แสดง) |
| **RelayThread** | ช่องสนทนาในระบบระหว่าง Owner กับ Finder — ไม่เปิดเบอร์/อีเมลทั้งสองฝ่าย | ContactInfo |
| **Closure** | การที่ Owner ปิดประกาศเป็น `RESOLVED` → หยุดกระจายประกาศเก่า (pain point หลักของ lab) | Delete (ไม่ลบ เก็บประวัติไว้) |

> หมายเหตุ: **ไม่มี** MicrochipId / Registration / ServicePoint / Slot ในระบบนี้ — ตัดออกตาม D1b (2026-10-03)

---

## 5. Open decisions (ยังไม่ตัดสิน — รอ grill)

- [x] **D1: หัวข้อ = ระบบตามหาสัตว์หาย (lost pet)** — ผู้ใช้เลือก 2026-10-03
  - ⚠️ ทับกับ `003_LAB_Lost_Pet_Finder` ซึ่งเป็น **design-only lab** (FR-01..07, NFR-01..04, ไม่ต้องเขียนโค้ด) ที่ทุกคนในห้องทำแล้ว → ถ้า implement แค่ FR-01..07 = ส่งการบ้านซ้ำ ไม่มีความต่าง
  - ✅ ข้อดี: requirement baseline ผ่านการ validate จากอาจารย์แล้ว + หลักฐานปัญหาแรง (จรจัด 3.6 ล้าน, ถูกกัด >1 ล้านคน/ปี, ข้อบัญญัติไมโครชิป)
- [x] **D1b: สัตว์หายล้วน — ไม่เอา PetID/ไมโครชิป/จองคิว** — ผู้ใช้ตัดสิน 2026-10-03 หลังเห็นข้อเสียแล้ว
  - ผลที่ตามมา: ไม่มี slot booking → **ต้องหา business rule อื่นมารองรับ Live System Gate (ต้องโชว์ failure case จากระบบจริง)**
  - rule ที่ใช้แทน (อยู่ในขอบเขตสัตว์หายล้วน ทั้งหมดมาจาก FR/NFR ของ lab เอง):
    - **C1 Closure integrity** — เบาะแสที่ส่งพร้อมจังหวะที่เจ้าของกดปิดประกาศ ต้องไม่หลุดเข้าประกาศที่ `RESOLVED` แล้ว (transaction + status guard) ← ตรงกับ pain point "ประกาศเก่ายังถูกแชร์แม้พบสัตว์แล้ว"
    - **C2 Authorization** — เฉพาะ Owner ของ LostReport เปลี่ยนสถานะได้ (ข้ามเจ้าของ = 403 ไม่ใช่หลุดข้อมูล) ← FR-06
    - **C3 Privacy** — response ของ API สาธารณะต้องไม่มี phone/email/ที่อยู่เลย คุยผ่าน RelayThread เท่านั้น ← FR-07/NFR-02
    - **C4 Idempotency** — กดส่งเบาะแสซ้ำ/เน็ตกระตุก ต้องไม่เกิดเบาะแสซ้ำซ้อน
    - **C5 Degraded mode** — worker/broker ตาย → สร้างประกาศและส่งเบาะแสยังทำได้ แจ้งเตือนตามมาทีหลัง
- [x] **D2: Scope = Core+** — FR-01..07 ของ lab + กฎ C1-C5 · **ตัดออก:** geo radius/PostGIS, AI/LLM, K8s, payment, mobile app, guest sighting
- [x] **D3: ใช้ Traefik + RabbitMQ/Celery** — Traefik = ทางเข้าเดียว + strip prefix (`/api` → FastAPI, `/` → React) · RabbitMQ+Celery = ส่งแจ้งเตือนเบาะแสใหม่ + resize รูปที่อัปโหลด (งานที่ผู้ใช้ไม่ต้องรอจริง)
- [x] **D4: ไม่ใช้ LLM** — spec ระบุชัดว่าไม่ใช้ไม่เสียคะแนน และการเคลมจะกลายเป็น acceptance criteria
- [x] **D5: ไม่ทำ K8s** — compose ในกล่องรายวิชาคือสิ่งที่ถูกตรวจ
- [x] **D7: Finder ต้อง login** — FR-07 ต้องคุยกันในระบบโดยไม่เปิดเบอร์ → ต้องมีตัวตนสองฝั่ง · Known Limitation: คนเดินผ่านต้องสมัครก่อนส่งเบาะแส (roadmap: guest one-time link)
- [x] **D8: Closure semantics** — เบาะแสที่มาหลังปิดประกาศ → **409 ปฏิเสธ** + ข้อความบนจอ + คืนข้อความที่พิมพ์ไว้ · Owner เปิดประกาศกลับเป็น `SEARCHING` ได้ บันทึกเหตุผล+เวลา
- [ ] D6: การแบ่งงาน 4 คน ให้ทุกคนผ่าน Ownership Gate
