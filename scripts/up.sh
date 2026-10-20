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
docker compose -f infra/docker-compose.yml ps
echo "เปิด http://localhost:8000 · dashboard http://localhost:8080"
