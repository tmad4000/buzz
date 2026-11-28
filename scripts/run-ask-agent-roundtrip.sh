#!/usr/bin/env bash
# Real-relay round trip for "Ask <contact>'s agent" (buzz-lanes-8pn.1).
#
# Starts its OWN Postgres + Redis containers (unique names, loopback-only random
# ports) and a local buzz-relay, runs
# desktop/tests/roundtrip/ask-contact-agent.roundtrip.mjs between controlled
# test identities, then tears everything down. Never touches shared compose
# services or a hosted relay.
#
#   BUZZ_ROUNDTRIP_RELAY_BIN  relay binary (default target/debug/buzz-relay)
#   BUZZ_ROUNDTRIP_OUT        evidence JSON path (default desktop/test-results/ask-agent-roundtrip.json)
#   BUZZ_ROUNDTRIP_PG_IMAGE / BUZZ_ROUNDTRIP_REDIS_IMAGE  container images
#   BUZZ_ROUNDTRIP_WEBSITE=1  also exercise Phase 2 website DMs
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="askrt-$$-$(date +%s)"
PG="${TAG}-pg"
REDIS="${TAG}-redis"
PG_IMAGE="${BUZZ_ROUNDTRIP_PG_IMAGE:-postgres:17-alpine}"
REDIS_IMAGE="${BUZZ_ROUNDTRIP_REDIS_IMAGE:-redis:7-alpine}"
RELAY_BIN="${BUZZ_ROUNDTRIP_RELAY_BIN:-${ROOT}/target/debug/buzz-relay}"
OUT="${BUZZ_ROUNDTRIP_OUT:-${ROOT}/desktop/test-results/ask-agent-roundtrip.json}"
LOG_DIR="$(dirname "${OUT}")"
RELAY_PID=""

free_port() {
  python3 - <<'PY'
import random, socket
for _ in range(200):
    port = random.randint(7000, 9999)
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        break
PY
}

log() { printf '[ask-agent-roundtrip] %s\n' "$*"; }

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "${RELAY_PID}" ]]; then
    kill "${RELAY_PID}" 2>/dev/null || true
    wait "${RELAY_PID}" 2>/dev/null || true
  fi
  docker rm -f "${PG}" "${REDIS}" >/dev/null 2>&1 || true
  log "torn down ${PG} ${REDIS} relay=${RELAY_PID:-none}"
  exit "${status}"
}
trap cleanup EXIT INT TERM

mkdir -p "${LOG_DIR}"
[[ -x "${RELAY_BIN}" ]] || { log "relay binary missing: ${RELAY_BIN}"; exit 2; }

PG_PORT="$(free_port)"
REDIS_PORT="$(free_port)"
RELAY_PORT="$(free_port)"
HEALTH_PORT="$(free_port)"
METRICS_PORT="$(free_port)"
HOST="localhost:${RELAY_PORT}"

log "starting ${PG} on 127.0.0.1:${PG_PORT}, ${REDIS} on 127.0.0.1:${REDIS_PORT}"
docker run -d --rm --name "${PG}" -p "127.0.0.1:${PG_PORT}:5432" \
  -e POSTGRES_USER=buzz -e POSTGRES_PASSWORD=buzz_dev -e POSTGRES_DB=buzz \
  "${PG_IMAGE}" >/dev/null
docker run -d --rm --name "${REDIS}" -p "127.0.0.1:${REDIS_PORT}:6379" \
  "${REDIS_IMAGE}" >/dev/null
for _ in $(seq 1 60); do
  docker exec "${PG}" pg_isready -h 127.0.0.1 -U buzz -d buzz >/dev/null 2>&1 && break
  sleep 1
done
docker exec "${PG}" pg_isready -h 127.0.0.1 -U buzz -d buzz >/dev/null

cd "${ROOT}"
export PGHOST=127.0.0.1 PGPORT="${PG_PORT}" PGUSER=buzz PGPASSWORD=buzz_dev PGDATABASE=buzz
export PGSCHEMA_PLAN_HOST=127.0.0.1 PGSCHEMA_PLAN_PORT="${PG_PORT}" PGSCHEMA_PLAN_DB=buzz
export PGSCHEMA_PLAN_USER=buzz PGSCHEMA_PLAN_PASSWORD=buzz_dev
./bin/pgschema apply --file schema/schema.sql --auto-approve > "${LOG_DIR}/ask-agent-roundtrip-schema.log" 2>&1
docker exec -i -e PGPASSWORD=buzz_dev "${PG}" psql -U buzz -d buzz -v ON_ERROR_STOP=1 \
  < scripts/reconcile-schema-after-pgschema.sql >> "${LOG_DIR}/ask-agent-roundtrip-schema.log" 2>&1
BUZZ_DB_PORT="${PG_PORT}" BUZZ_DB_DOCKER_CONTAINER="${PG}" BUZZ_COMMUNITY_HOST="${HOST}" \
  ./scripts/setup-desktop-test-data.sh

log "starting relay ws://${HOST}"
env \
  DATABASE_URL="postgres://buzz:buzz_dev@127.0.0.1:${PG_PORT}/buzz" \
  REDIS_URL="redis://127.0.0.1:${REDIS_PORT}/0" \
  RELAY_URL="ws://${HOST}" \
  BUZZ_BIND_ADDR="127.0.0.1:${RELAY_PORT}" \
  BUZZ_HEALTH_PORT="${HEALTH_PORT}" \
  BUZZ_METRICS_PORT="${METRICS_PORT}" \
  BUZZ_RELAY_PRIVATE_KEY="$(openssl rand -hex 32)" \
  BUZZ_REQUIRE_AUTH_TOKEN=false \
  BUZZ_PUSH_ENABLED=false \
  BUZZ_GIT_CONFORMANCE_PROBE=false \
  BUZZ_RATE_LIMIT_HUMAN_MESSAGES_PER_MIN=1000000 \
  BUZZ_RATE_LIMIT_HUMAN_API_CALLS_PER_MIN=1000000 \
  RUST_LOG=buzz_relay=info \
  "${RELAY_BIN}" > "${LOG_DIR}/ask-agent-roundtrip-relay.log" 2>&1 &
RELAY_PID=$!
for _ in $(seq 1 300); do
  kill -0 "${RELAY_PID}" 2>/dev/null || { tail -40 "${LOG_DIR}/ask-agent-roundtrip-relay.log"; exit 1; }
  curl --silent --fail --max-time 1 "http://127.0.0.1:${HEALTH_PORT}/_readiness" >/dev/null && break
  sleep 0.2
done
curl --silent --fail --max-time 1 "http://127.0.0.1:${HEALTH_PORT}/_readiness" >/dev/null

log "running round trip"
cd "${ROOT}/desktop"
BUZZ_ROUNDTRIP_RELAY_URL="http://${HOST}" BUZZ_ROUNDTRIP_OUT="${OUT}" \
  node --import ./test-loader.mjs --experimental-strip-types \
  tests/roundtrip/ask-contact-agent.roundtrip.mjs
