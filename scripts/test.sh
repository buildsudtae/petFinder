#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'docker compose -f infra/docker-compose.test.yml down -v' EXIT
docker compose -f infra/docker-compose.test.yml build
docker compose -f infra/docker-compose.test.yml run --rm api-test
