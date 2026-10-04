#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "ไม่พบ .env — คัดลอกจาก .env.example ก่อน"; exit 1; }
# worker image is FROM pettech-api: build api first so compose does not race to pull it
docker compose --env-file .env -f infra/docker-compose.yml build api
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps
echo "เปิด http://localhost:8000 · dashboard http://localhost:8080"
