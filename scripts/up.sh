#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "ไม่พบ .env — คัดลอกจาก .env.example ก่อน"; exit 1; }
# .env copied straight from .env.example still has the published placeholder JWT_SECRET, which the api
# refuses to boot with: replace it with a fresh random value (only that line; other values are kept)
if grep -q '^JWT_SECRET=generate-with-openssl-rand-hex-32$' .env; then
  secret=$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(32))')
  sed -i "s/^JWT_SECRET=generate-with-openssl-rand-hex-32$/JWT_SECRET=${secret}/" .env
  echo "สร้าง JWT_SECRET ใหม่ใน .env แล้ว"
fi
# worker image is FROM pettech-api: build api first so compose does not race to pull it
docker compose --env-file .env -f infra/docker-compose.yml build api
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
# รอจน api ลงทะเบียนกับ Traefik — ก่อนหน้านั้น /api/health ตกไปที่ web ซึ่งตอบ 200 เป็น HTML
# จึงต้องเช็ก "status":"ok" ไม่ใช่แค่ HTTP 200 (เงื่อนไขเดียวกับ stage Deploy ใน Jenkinsfile)
printf 'รอระบบพร้อม'
ok=0
for i in $(seq 1 60); do
  if curl -fsS http://localhost:8000/api/health 2>/dev/null | grep -q '"status":"ok"'; then ok=1; break; fi
  printf '.'; sleep 2
done
echo
docker compose -f infra/docker-compose.yml ps
[ "$ok" = 1 ] || { echo "ระบบไม่พร้อมภายใน 120 วินาที — ดู log: docker compose -f infra/docker-compose.yml logs api"; exit 1; }
echo "เปิด http://localhost:8000 · dashboard http://localhost:8080"
