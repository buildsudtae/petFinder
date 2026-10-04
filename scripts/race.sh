#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BASE_URL:-http://localhost:8000}"
curl -fsS "$BASE/api/health" >/dev/null || { echo "ระบบยังไม่ขึ้น: รัน scripts/up.sh ก่อน"; exit 1; }
# Resolve by compose SERVICE name (api runs N replicas, so no container_name).
# BASE_URL=http://traefik makes the requests leave the container and re-enter via the gateway,
# which round-robins across the replicas on the petnet network.
docker compose -f infra/docker-compose.yml exec -T -e BASE_URL=http://traefik api \
  python -m pytest tests/concurrency -v
