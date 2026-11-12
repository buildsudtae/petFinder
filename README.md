# La peace (Lost Pet Finder)

เว็บแอปสำหรับเจ้าของสัตว์เลี้ยงที่หายและผู้พบเห็น: เจ้าของประกาศตามหา, ผู้พบเห็นส่งเบาะแส (พร้อมรูปได้), ทั้งสองฝ่ายคุยกันผ่านระบบโดยไม่เห็นข้อมูลติดต่อของกัน

เอกสารนี้เขียนให้ทำตามได้ทีละบรรทัด **ในกล่องของรายวิชา** โดยไม่ต้องเดาขั้นตอนใด

แผนภาพสถาปัตยกรรมและพฤติกรรมเมื่อแต่ละส่วนล่ม: [`docs/architecture.md`](docs/architecture.md) · Requirement → หลักฐาน: [`docs/traceability.md`](docs/traceability.md)

## 1. ข้อกำหนดเบื้องต้น

| สิ่งที่ต้องมี | รายละเอียด |
|---|---|
| กล่องรายวิชา | image `tuchsanai/devtools:2569_1` (Docker-in-Docker) — มี `docker`, `docker compose`, `git`, `curl`, `bash` อยู่แล้ว |
| พอร์ตที่ต้องเปิดออกจากกล่อง | `8000` และ `8080` เท่านั้น (ดูตารางข้อ 3) |
| ทรัพยากร | พอสำหรับรัน 7 container พร้อมกัน (traefik, web, api x2, db, rabbitmq, worker) |
| อินเทอร์เน็ต | ครั้งแรกต้อง pull image (`postgres:17`, `rabbitmq:3-management`, `traefik:v3.7.4`, base image ของ Python/Node) · ตอนใช้งาน ภาพถนนบนแผนที่ดึงจาก OpenStreetMap ผ่าน nginx ของเรา (ไม่มีเน็ตแล้วภาพถนนว่าง แต่ระบบและขอบเขตเขตยังทำงาน) |

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

```bash
git clone https://github.com/buildsudtae/petFinder.git pettech && cd pettech
# หรือ (ถ้าโค้ดอยู่บนเครื่องโฮสต์): docker cp ./pettech devtools:/workspace/pettech
```

## 2. คำสั่ง 5 บรรทัด: start / test / smoke / race / stop

```bash
cp .env.example .env && ./scripts/up.sh   # 1. start  — build + เปิดระบบ แล้วเข้า http://localhost:8000
./scripts/test.sh                         # 2. test   — unit + integration ใน container ชั่วคราว (DB แยก ลบทิ้งเมื่อจบ)
(cd web && npm test)                      #    web    — เทสต์ฝั่งหน้าเว็บ (vitest); ใน pipeline คือ `docker build --target test ./web`
./scripts/smoke.sh                        # 3. smoke  — ไล่เส้นทางหลักบนระบบที่เปิดอยู่ ต้องจบด้วย "smoke test ผ่านทั้งหมด"
./scripts/race.sh                         # 4. race   — ยิงแข่งกันผ่าน Traefik ไปที่ api ทั้ง 2 replica
./scripts/degraded.sh                     #    C5     — หยุด broker+worker แล้วส่งเบาะแส ต้องได้ 201 และแจ้งเตือนตามมาเมื่อเปิดคืน
./scripts/down.sh                         # 5. stop   — หยุดระบบ (ใส่ -v ต่อท้ายเพื่อลบข้อมูล DB ด้วย)
```

ลำดับสำคัญ: `smoke.sh`, `race.sh` และ `degraded.sh` ต้องรันหลัง `up.sh` (ระบบต้องขึ้นอยู่ — `up.sh` รอจน api พร้อมให้เอง สูงสุด 120 วินาที) ส่วน `test.sh` รันเมื่อไหร่ก็ได้เพราะใช้ DB ของตัวเอง
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
| `8081` (บนเครื่องโฮสต์ ไม่ใช่ในกล่อง) | Jenkins | ดูและสั่งรัน pipeline (ดูข้อ 4) — ใช้ 8081 เพราะ 8080 เป็นของ Traefik dashboard |
| ไม่เปิดออกนอกกล่อง | api (x2), worker, db, rabbitmq | คุยกันในเครือข่าย `petnet` ของ Docker เท่านั้น — ตั้งใจให้ไม่มี `ports:` และไม่มี `container_name` ใน api |

## 4. ตั้งค่า Jenkins credential (สำหรับ `Jenkinsfile`)

### 4.1 ยก Jenkins ขึ้น (ครั้งแรกครั้งเดียว — รันบนเครื่องโฮสต์ ต้องมีกล่อง `devtools` จากข้อ 1 ก่อน)

```bash
docker network create --subnet 10.201.0.0/24 devtools-ci
docker run -d --name jenkins --network devtools-ci --restart unless-stopped -p 8081:8080 -v jenkins_home:/var/jenkins_home jenkins/jenkins:lts-jdk21
docker network connect devtools-ci devtools
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

- เปิด http://localhost:8081 วางรหัสจากบรรทัดสุดท้าย → *Install suggested plugins* → สร้างบัญชี admin
- ติดตั้ง plugin **SSH Agent** เพิ่ม (Manage Jenkins → Plugins → Available) — ไม่อยู่ในชุดแนะนำ แต่ทุก stage ใช้ `sshagent` ไม่มีจะล้มตั้งแต่ stage Connect ด้วย `No such DSL method 'sshagent'`
- `devtools-ci` ทำให้ Jenkins เรียกกล่องด้วยชื่อ `devtools` ได้ · ต้องกำหนด subnet เอง เพราะ subnet อัตโนมัติ `172.18.0.0/16` ชนกับ `docker0` ภายในกล่อง แล้ว `docker network connect` จะล้ม

### 4.2 ให้ Jenkins SSH เข้ากล่องได้

```bash
docker exec jenkins ssh-keygen -t ed25519 -N "" -f /var/jenkins_home/devtools_ed25519
docker exec jenkins cat /var/jenkins_home/devtools_ed25519.pub > devtools_ed25519.pub
docker cp devtools_ed25519.pub devtools:/tmp/jenkins.pub
docker exec devtools bash -c "mkdir -p /root/.ssh && chmod 700 /root/.ssh && cat /tmp/jenkins.pub >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys"
docker exec jenkins ssh -i /var/jenkins_home/devtools_ed25519 -o StrictHostKeyChecking=accept-new root@devtools hostname
docker exec jenkins cat /var/jenkins_home/devtools_ed25519
```

บรรทัดรองสุดท้ายต้องได้ชื่อเครื่องโดยไม่ถามรหัสผ่าน · บรรทัดสุดท้ายแสดง private key ให้ copy ไปใส่ credential `devtools-ssh` ในตารางด้านล่าง (ห้าม commit หรือส่ง key นี้ให้ใคร) แล้วลบไฟล์ `devtools_ed25519.pub` ที่โฮสต์ทิ้งได้

### 4.3 credential และ job

Jenkins ไม่ build เอง — มัน SSH เข้ากล่องรายวิชาแล้วสั่ง docker ในกล่อง (pattern เดียวกับ lab `003_LAB_Docker_Build_Push` และ `004_LAB_Webhook_Trigger`) ต้องสร้าง credential 2 ตัวที่ **Manage Jenkins → Credentials → (global) → Add Credentials** โดยตั้ง **ID ให้ตรงตามนี้ทุกตัวอักษร**:

| ID | Kind | ใส่อะไร |
|---|---|---|
| `devtools-ssh` | SSH Username with private key | Username `root`, private key ที่ public key ของมันอยู่ใน `~/.ssh/authorized_keys` ของกล่อง |
| `dockerhub` | Username with password | Username = ชื่อ Docker Hub ของคุณ, Password = **access token** ของ Docker Hub (ไม่ใช่รหัสผ่านบัญชี) |

เงื่อนไขอื่นของ pipeline:

- Jenkins ต้องเรียก `ssh root@devtools` ได้ (ชื่อโฮสต์ `devtools` ต้องแก้ได้จากเครื่อง Jenkins — ถ้าชื่อต่างจากนี้ ให้แก้ `SSH_DEVTOOLS` ที่หัว `Jenkinsfile`)
- สร้าง Pipeline job แบบ *Pipeline script from SCM* ชี้ที่ repo นี้ และเปิด trigger `GitHub hook trigger for GITScm polling` พร้อมตั้ง webhook ที่ GitHub (`<jenkins>/github-webhook/`)
- ลำดับ stage: Connect → Secrets → Ship source → Build → Test → Web tests → Push → Deploy → Verify. **Test แดง = ไม่ Push ไม่ Deploy** (stage ถัดไปไม่ทำงาน)
- Verify ตรวจว่า `/api/health` ของที่ deploy มี `commit` ตรงกับ commit ที่เพิ่งผ่านเทสต์ แล้วรัน `smoke.sh` และ `race.sh` ซ้ำกับระบบที่ deploy จริง
- `.env` ห้าม commit: stage Secrets ล้ม build ถ้า `.env` ถูก track ใน git (commit เฉพาะ `.env.example`)
- ค่าใน job: Repository URL `https://github.com/buildsudtae/petFinder.git` · Branch `*/main` · Script Path `Jenkinsfile`
- Jenkins ที่รันบน localhost รับ webhook จาก GitHub ไม่ได้ (GitHub มองไม่เห็นเครื่องเรา) — กด **Build Now** ในหน้า job เอง หรือใช้ tunnel ถ้าต้องการ trigger อัตโนมัติ
- stage Ship source **ลบ `/workspace/pettech` ในกล่องทั้งโฟลเดอร์** แล้วใส่โค้ดชุดใหม่แทน และ Deploy ใช้ชื่อโปรเจกต์ `pettech` เดียวกับที่รันด้วยมือ — ระบบที่ยกเองจะถูกแทนที่ (ข้อมูลใน volume ยังอยู่) · `JWT_SECRET` สุ่มใหม่ทุก build ผู้ใช้จึงต้อง login ใหม่หลัง deploy

### 4.4 ปิดเครื่องแล้วเปิดกลับมา

```bash
# ก่อนปิดเครื่อง — stop เท่านั้น ห้าม docker rm (ลบ devtools = ข้อมูลทั้งหมดในกล่องหาย)
docker stop jenkins devtools

# เปิดกลับมา
docker start devtools jenkins
docker exec devtools bash -c "cd /workspace/pettech && docker compose --env-file .env -f infra/docker-compose.yml start"
```

- บรรทัดสุดท้ายจำเป็น: container ของระบบในกล่องไม่มี restart policy จึงไม่ขึ้นเองเมื่อกล่องเปิด · `start` เปิดชุดเดิมที่ Jenkins deploy ไว้ (เลข build เดิมใน `/api/health`) ไม่ build ใหม่
- ไม่ใช้ `up -d` / `up.sh` ตรงนี้ถ้าต้องการโชว์ระบบที่ Jenkins deploy: สองคำสั่งนั้น build ใหม่เป็นแท็ก `dev` และ `/api/health` จะได้ `commit: "unknown"` — ถ้าเผลอใช้ ให้กด Build Now ใหม่
- `jenkins` ตั้ง `--restart unless-stopped`: ถ้าปิดเครื่องโดยไม่ได้ stop จะเปิดเองพร้อม Docker · `devtools` ต้อง `docker start` เองเสมอ
- รอราว 20–30 วินาที แล้วเข้า http://localhost:8000 (เว็บ) · http://localhost:8080 (Traefik) · http://localhost:8081 (Jenkins)

## 5. กฎความถูกต้อง C1–C5 และคำสั่งที่พิสูจน์

ทุกคำสั่งรันจากโฟลเดอร์โปรเจกต์ ระบบต้องขึ้นอยู่ (`./scripts/up.sh`) สำหรับแถวที่ใช้ `race.sh`/`smoke.sh`

ตัวย่อในตาราง: `T` = `docker compose -f infra/docker-compose.test.yml run --rm api-test python -m pytest -v` (DB ชั่วคราว) — หลังรันชุด `T` ให้ล้างด้วย `docker compose -f infra/docker-compose.test.yml down -v`

| กฎ | ความหมาย | คำสั่งที่พิสูจน์ | ผลที่ต้องเห็น |
|---|---|---|---|
| **C1** Closure integrity | เบาะแสที่มาพร้อมจังหวะที่เจ้าของปิดประกาศ ต้องไม่หลุดเข้าประกาศที่ `RESOLVED` | `./scripts/race.sh` (ยิงแข่งผ่านทั้ง 2 replica: `test_closing_while_sighting_arrives_never_leaves_sighting_in_closed_report`) และ `./scripts/smoke.sh` ขั้น "เบาะแสหลังปิดต้องได้ 409" | race: `passed` · smoke: จบด้วย "smoke test ผ่านทั้งหมด" (ส่งเบาะแสหลังปิด ได้ 409 `REPORT_CLOSED`) |
| **C2** Authorization | เฉพาะเจ้าของประกาศเปลี่ยนสถานะได้ ข้ามเจ้าของ = 403 โดยไม่หลุดข้อมูล, ไม่ล็อกอิน = 401 | `T tests/integration/test_status.py -k "non_owner or anonymous"` | `2 passed` |
| **C3** Privacy | response สาธารณะและตาราง `users` ไม่มี phone/email/address/line_id | `T tests/unit/test_privacy.py` และ `./scripts/smoke.sh` ขั้น "ข้อมูลสาธารณะต้องไม่มีข้อมูลติดต่อ" | `passed` ทุกข้อ · smoke ผ่านขั้นนั้น |
| **C4** Idempotency | ส่งเบาะแสซ้ำด้วย `Idempotency-Key` เดิม (กดซ้ำ/เน็ตกระตุก) ต้องได้แถวเดียว | `./scripts/race.sh` (ยิง 10 คำขอเหมือนกันพร้อมกัน: `test_ten_parallel_identical_sightings_create_exactly_one_row`) และ `T tests/integration/test_sightings.py -k idempotency_key` | `passed` |
| **C5** Degraded mode | worker/broker ตาย → สร้างประกาศและส่งเบาะแสยังได้ แจ้งเตือนตามมาทีหลัง (ผ่านตาราง outbox) | `T tests/integration/test_outbox.py` และ `./scripts/degraded.sh` (หยุด rabbitmq+worker บนระบบที่รันจริง) | `passed` (รวม `test_api_still_accepts_sighting_when_broker_is_unreachable`) · degraded: จบด้วย "C5 degraded mode ผ่าน" |

สรุปชุดเต็ม: `./scripts/test.sh` (unit + integration + worker) และ `./scripts/race.sh` (concurrency) ครอบทุกกฎ

## 6. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `ไม่พบ .env — คัดลอกจาก .env.example ก่อน` | ยังไม่ได้ `cp .env.example .env` |
| `ระบบยังไม่ขึ้น: รัน scripts/up.sh ก่อน` | `race.sh`/`smoke.sh` ถูกรันก่อนระบบขึ้น — รัน `up.sh` ก่อน (สคริปต์รอจน api พร้อมแล้วจึงจบ) ดูสถานะได้ด้วย `docker compose --env-file .env -f infra/docker-compose.yml ps` |
| `ระบบไม่พร้อมภายใน 120 วินาที` (ตอนจบ `up.sh`) | api ยังไม่ลงทะเบียนกับ Traefik หรือบูตไม่ขึ้น — ดูสาเหตุด้วย `docker compose --env-file .env -f infra/docker-compose.yml logs api` |
| คำเตือน `The "…" variable is not set` | สั่ง `docker compose` เองโดยไม่ใส่ `--env-file .env` — สคริปต์ทุกตัวใส่ให้แล้ว ถ้าพิมพ์เองให้ใส่เหมือนคำสั่งในตารางนี้ |
| พอร์ต 8000/8080 ถูกใช้อยู่ | มีระบบชุดก่อนหน้ายังไม่หยุด — `./scripts/down.sh` |
| `smoke.sh` หยุดที่ "คาดหวัง 409 แต่ได้ …" | กฎ C1 พัง จริง — ห้ามข้ามขั้นนี้ |

## 7. การใช้ AI Coding Tools (ตามข้อ 8 ของรายละเอียดโครงการ)

- **เครื่องมือ:** Claude Code (Anthropic) · ระบบที่ส่งมอบ**ไม่มี** LLM/AI ทำงานอยู่ข้างใน (D4)
- **ใช้ช่วยงานประเภทใด:** อ่านและสรุปข้อกำหนดรายวิชา · ออกแบบ (spec, ADR, mockup v5) · เขียนโค้ด API, worker, หน้าเว็บ, migration · เขียนเทสต์และสคริปต์ตรวจ (smoke, race, degraded) · เอกสาร (README, traceability, architecture)
- **วิธีระบุใน Git:** commit ที่ AI ช่วยมีบรรทัด `Co-Authored-By: Claude …` ท้ายข้อความ commit
- **ทีมยังรับผิดชอบเอง:** ผลทุกอย่างผ่านเทสต์อัตโนมัติและ pipeline เดียวกับโค้ดที่เขียนเอง และสมาชิกต้องอธิบาย ตามรอย data flow และแก้ defect ในส่วนของตนได้ (Ownership Gate)

## 8. ข้อจำกัดที่รู้อยู่แล้ว

- Traefik dashboard ที่พอร์ต `8080` เปิดแบบไม่มีรหัส (`--api.insecure=true`) เพื่อให้กรรมการดู router และ replica ได้ระหว่างเดโม — ใช้แบบนี้ในกล่องรายวิชาเท่านั้น ห้ามเปิดพอร์ตนี้สู่สาธารณะ
- ภาพถนนบนแผนที่ต้องใช้อินเทอร์เน็ต (ดูข้อ 1) · ฟอนต์อยู่ใน build ของเว็บแล้ว (`@fontsource`) ไม่ต้องใช้เน็ต
- ผู้ที่เคยส่งเบาะแสได้รับแจ้งเตือนเมื่อเจ้าของเปลี่ยนสถานะ (บันทึกใน `/api/notifications`) แต่หน้าเว็บยังไม่มีหน้าแสดงแจ้งเตือนฝั่งผู้พบเห็น — badge ที่ "ประกาศของฉัน" นับเฉพาะเบาะแสใหม่ในประกาศของตัวเอง
- healthcheck ของ api (`/api/health`) เช็คแค่ว่า process ยังอยู่ ตอน DB ล่ม api ยัง healthy แต่ `/api/ready` ตอบ 503 — ใช้ `/api/ready` เมื่อต้องการรู้ว่ารับงานได้จริงไหม
- `npm audit` พบช่องโหว่เฉพาะเครื่องมือ dev (`vite`, `vitest`) ซึ่งไม่อยู่ใน image ที่ deploy (stage สุดท้ายเป็น nginx + ไฟล์ static) — ตรวจด้วย `cd web && npm audit --omit=dev` ต้องได้ 0
- ช่องว่างที่ยังไม่มีเทสต์ดูได้ที่ `docs/traceability.md` หัวข้อ "ช่องว่างที่ยอมรับตรงๆ"
