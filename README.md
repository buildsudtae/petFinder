# ตามหา (Lost Pet Finder)

เว็บแอปสำหรับเจ้าของสัตว์เลี้ยงที่หายและผู้พบเห็น: เจ้าของประกาศตามหา, ผู้พบเห็นส่งเบาะแส (พร้อมรูปได้), ทั้งสองฝ่ายคุยกันผ่านระบบโดยไม่เห็นข้อมูลติดต่อของกัน

> **Checklist ก่อนส่ง (ห้ามข้าม):** ☐ push repo ขึ้น GitHub แล้ว และแก้ `<URL-GITHUB-REPO-ของทีม>` ในหัวข้อ 1 เป็น URL จริง — ตอนนี้ README ยังใช้ตามไม่ได้จนกว่าจะทำข้อนี้

เอกสารนี้เขียนให้ทำตามได้ทีละบรรทัด **ในกล่องของรายวิชา** โดยไม่ต้องเดาขั้นตอนใด

## 1. ข้อกำหนดเบื้องต้น

| สิ่งที่ต้องมี | รายละเอียด |
|---|---|
| กล่องรายวิชา | image `tuchsanai/devtools:2569_1` (Docker-in-Docker) — มี `docker`, `docker compose`, `git`, `curl`, `bash` อยู่แล้ว |
| พอร์ตที่ต้องเปิดออกจากกล่อง | `8000` และ `8080` เท่านั้น (ดูตารางข้อ 3) |
| ทรัพยากร | พอสำหรับรัน 7 container พร้อมกัน (traefik, web, api x2, db, rabbitmq, worker) |
| อินเทอร์เน็ต | ครั้งแรกต้อง pull image (`postgres:17`, `rabbitmq:3-management`, `traefik:v3.7.4`, base image ของ Python/Node) |

เริ่มกล่องด้วยคำสั่งนี้ (คำสั่งตาม reference ของรายวิชา `00_Tool/01_Reference/readme.md` บวกพอร์ตของระบบเรา):

```bash
docker run -d --name devtools --privileged -p 2222:22 -p 8000:8000 -p 8080:8080 tuchsanai/devtools:2569_1
docker exec -it devtools bash
```

- `--privileged` **จำเป็น** สำหรับ Docker-in-Docker — ถ้าไม่ใส่ container จะหยุดทันที ดูเหตุผลด้วย `docker logs devtools`
- `-p 2222:22` เปิด SSH ออกมาที่โฮสต์ (Jenkins ใช้ตอนต่อเข้ากล่อง) · `-p 8000:8000 -p 8080:8080` ให้เบราว์เซอร์บนโฮสต์เข้าระบบของเราได้
- ไม่ต้องใส่ `-it` ตอน `docker run` เพราะ entrypoint รอ `dockerd` และถือ container ไว้ให้เอง
- ทางเลือกกรณีไม่ใช้ `--privileged`: ตั้ง `START_DOCKERD=0` แล้ว mount docker socket ของโฮสต์เข้าไป (ดูรายละเอียดใน reference ของรายวิชา)

เอาโค้ดนี้เข้าไปไว้ในกล่อง แล้วเข้าไปในโฟลเดอร์โปรเจกต์ — ทุกคำสั่งด้านล่างรันจากโฟลเดอร์นี้:

> **ทีมต้องแก้ก่อนส่งงาน:** บรรทัด `git clone` ด้านล่างยังเป็นที่ว่าง เพราะยังไม่ได้สร้าง GitHub repository — ต้อง push โค้ดขึ้น GitHub แล้วแทนที่ `<URL-GITHUB-REPO-ของทีม>` ด้วย URL จริง ผู้ตรวจจะ clone โค้ดไม่ได้ถ้าไม่แก้

```bash
git clone <URL-GITHUB-REPO-ของทีม> pettech && cd pettech
# หรือ (ถ้าโค้ดอยู่บนเครื่องโฮสต์): docker cp ./pettech devtools:/workspace/pettech
```

## 2. คำสั่ง 5 บรรทัด: start / test / smoke / race / stop

```bash
cp .env.example .env && ./scripts/up.sh   # 1. start  — build + เปิดระบบ แล้วเข้า http://localhost:8000
./scripts/test.sh                         # 2. test   — unit + integration ใน container ชั่วคราว (DB แยก ลบทิ้งเมื่อจบ)
./scripts/smoke.sh                        # 3. smoke  — ไล่เส้นทางหลักบนระบบที่เปิดอยู่ ต้องจบด้วย "smoke test ผ่านทั้งหมด"
./scripts/race.sh                         # 4. race   — ยิงแข่งกันผ่าน Traefik ไปที่ api ทั้ง 2 replica
./scripts/down.sh                         # 5. stop   — หยุดระบบ (ใส่ -v ต่อท้ายเพื่อลบข้อมูล DB ด้วย)
```

ลำดับสำคัญ: `smoke.sh` และ `race.sh` ต้องรันหลัง `up.sh` (ระบบต้องขึ้นอยู่) ส่วน `test.sh` รันเมื่อไหร่ก็ได้เพราะใช้ DB ของตัวเอง
ถ้าระบบยังไม่ขึ้น `race.sh` จะหยุดพร้อมข้อความ "ระบบยังไม่ขึ้น: รัน scripts/up.sh ก่อน"
`race.sh` รันเทสต์ที่ถูกบรรจุอยู่ใน image ของ api — ถ้าแก้โค้ดหรือเทสต์ต้อง `./scripts/up.sh` ใหม่ก่อน

ข้อมูลตัวอย่างสำหรับดูหน้าเว็บ (ไม่บังคับ): `./scripts/seed.sh` — สร้างบัญชี `demo@example.com` กับประกาศ 2 รายการ

ตรวจว่าระบบขึ้นแล้ว และดูว่ากำลังรันโค้ดเวอร์ชันไหน:

```bash
curl -fsS http://localhost:8000/api/health
# {"status":"ok","version":"0.1.0","commit":"<git sha>","build":"<เลข build>"}
```

## 3. พอร์ต

| พอร์ต (ออกนอกกล่อง) | บริการ | ใช้ทำอะไร |
|---|---|---|
| `8000` | Traefik → web + api | หน้าเว็บที่ `/` และ API ที่ `/api/*` (ผ่าน load balancer ไป api 2 replica) |
| `8080` | Traefik dashboard | ดู router/service และ replica ที่ลงทะเบียนอยู่ |
| ไม่เปิดออกนอกกล่อง | api (x2), worker, db, rabbitmq | คุยกันในเครือข่าย `petnet` ของ Docker เท่านั้น — ตั้งใจให้ไม่มี `ports:` และไม่มี `container_name` ใน api |

## 4. ตั้งค่า Jenkins credential (สำหรับ `Jenkinsfile`)

Jenkins ไม่ build เอง — มัน SSH เข้ากล่องรายวิชาแล้วสั่ง docker ในกล่อง (pattern เดียวกับ lab `003_LAB_Docker_Build_Push` และ `004_LAB_Webhook_Trigger`) ต้องสร้าง credential 2 ตัวที่ **Manage Jenkins → Credentials → (global) → Add Credentials** โดยตั้ง **ID ให้ตรงตามนี้ทุกตัวอักษร**:

| ID | Kind | ใส่อะไร |
|---|---|---|
| `devtools-ssh` | SSH Username with private key | Username `root`, private key ที่ public key ของมันอยู่ใน `~/.ssh/authorized_keys` ของกล่อง |
| `dockerhub` | Username with password | Username = ชื่อ Docker Hub ของคุณ, Password = **access token** ของ Docker Hub (ไม่ใช่รหัสผ่านบัญชี) |

เงื่อนไขอื่นของ pipeline:

- Jenkins ต้องเรียก `ssh root@devtools` ได้ (ชื่อโฮสต์ `devtools` ต้องแก้ได้จากเครื่อง Jenkins — ถ้าชื่อต่างจากนี้ ให้แก้ `SSH_DEVTOOLS` ที่หัว `Jenkinsfile`)
- สร้าง Pipeline job แบบ *Pipeline script from SCM* ชี้ที่ repo นี้ และเปิด trigger `GitHub hook trigger for GITScm polling` พร้อมตั้ง webhook ที่ GitHub (`<jenkins>/github-webhook/`)
- ลำดับ stage: Connect → Secrets → Ship source → Build → Test → Push → Deploy → Verify. **Test แดง = ไม่ Push ไม่ Deploy** (stage ถัดไปไม่ทำงาน)
- Verify ตรวจว่า `/api/health` ของที่ deploy มี `commit` ตรงกับ commit ที่เพิ่งผ่านเทสต์ แล้วรัน `smoke.sh` และ `race.sh` ซ้ำกับระบบที่ deploy จริง
- `.env` ห้าม commit: stage Secrets ล้ม build ถ้า `.env` ถูก track ใน git (commit เฉพาะ `.env.example`)

## 5. กฎความถูกต้อง C1–C5 และคำสั่งที่พิสูจน์

ทุกคำสั่งรันจากโฟลเดอร์โปรเจกต์ ระบบต้องขึ้นอยู่ (`./scripts/up.sh`) สำหรับแถวที่ใช้ `race.sh`/`smoke.sh`

ตัวย่อในตาราง: `T` = `docker compose -f infra/docker-compose.test.yml run --rm api-test python -m pytest -v` (DB ชั่วคราว) — หลังรันชุด `T` ให้ล้างด้วย `docker compose -f infra/docker-compose.test.yml down -v`

| กฎ | ความหมาย | คำสั่งที่พิสูจน์ | ผลที่ต้องเห็น |
|---|---|---|---|
| **C1** Closure integrity | เบาะแสที่มาพร้อมจังหวะที่เจ้าของปิดประกาศ ต้องไม่หลุดเข้าประกาศที่ `RESOLVED` | `./scripts/race.sh` (ยิงแข่งผ่านทั้ง 2 replica: `test_closing_while_sighting_arrives_never_leaves_sighting_in_closed_report`) และ `./scripts/smoke.sh` ขั้น "เบาะแสหลังปิดต้องได้ 409" | race: `passed` · smoke: จบด้วย "smoke test ผ่านทั้งหมด" (ส่งเบาะแสหลังปิด ได้ 409 `REPORT_CLOSED`) |
| **C2** Authorization | เฉพาะเจ้าของประกาศเปลี่ยนสถานะได้ ข้ามเจ้าของ = 403 โดยไม่หลุดข้อมูล, ไม่ล็อกอิน = 401 | `T tests/integration/test_status.py -k "non_owner or anonymous"` | `2 passed` |
| **C3** Privacy | response สาธารณะและตาราง `users` ไม่มี phone/email/address/line_id | `T tests/unit/test_privacy.py` และ `./scripts/smoke.sh` ขั้น "ข้อมูลสาธารณะต้องไม่มีข้อมูลติดต่อ" | `passed` ทุกข้อ · smoke ผ่านขั้นนั้น |
| **C4** Idempotency | ส่งเบาะแสซ้ำด้วย `Idempotency-Key` เดิม (กดซ้ำ/เน็ตกระตุก) ต้องได้แถวเดียว | `./scripts/race.sh` (ยิง 10 คำขอเหมือนกันพร้อมกัน: `test_ten_parallel_identical_sightings_create_exactly_one_row`) และ `T tests/integration/test_sightings.py -k idempotency_key` | `passed` |
| **C5** Degraded mode | worker/broker ตาย → สร้างประกาศและส่งเบาะแสยังได้ แจ้งเตือนตามมาทีหลัง (ผ่านตาราง outbox) | `T tests/integration/test_outbox.py` | `passed` (รวม `test_api_still_accepts_sighting_when_broker_is_unreachable`) |

สรุปชุดเต็ม: `./scripts/test.sh` (unit + integration + worker) และ `./scripts/race.sh` (concurrency) ครอบทุกกฎ

## 6. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `ไม่พบ .env — คัดลอกจาก .env.example ก่อน` | ยังไม่ได้ `cp .env.example .env` |
| `ระบบยังไม่ขึ้น: รัน scripts/up.sh ก่อน` | `race.sh`/`smoke.sh` ถูกรันก่อนระบบขึ้น — รัน `up.sh` แล้วรอ api เป็น healthy (`docker compose -f infra/docker-compose.yml ps`) |
| พอร์ต 8000/8080 ถูกใช้อยู่ | มีระบบชุดก่อนหน้ายังไม่หยุด — `./scripts/down.sh` |
| `smoke.sh` หยุดที่ "คาดหวัง 409 แต่ได้ …" | กฎ C1 พัง จริง — ห้ามข้ามขั้นนี้ |
