#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NAS_HOST="${NAS_HOST:-dsm918}"
NAS_DOCKER_BIN="${NAS_DOCKER_BIN:-/volume1/@appstore/Docker/usr/bin/docker}"
NAS_RSYNC_BIN="${NAS_RSYNC_BIN:-/usr/bin/rsync}"
IMAGE_TAG="${IMAGE_TAG:-jarvis-server:amd64}"
PLATFORM="${PLATFORM:-linux/amd64}"
CONTAINER_NAME="${CONTAINER_NAME:-jarvis-server}"
HOST_PORT="${HOST_PORT:-8787}"
NAS_DATA_DIR="${NAS_DATA_DIR:-/volume1/docker/jarvis/data}"
NAS_KNOWLEDGE_DIR="${NAS_KNOWLEDGE_DIR:-/var/services/homes/zhouquan/dropbox/MyDocuments}"
SYNC_ALLOWED_ORIGINS="${SYNC_ALLOWED_ORIGINS:-http://192.168.1.4:8787,http://100.110.154.91:8787,http://dsm918:8787}"
CHATPRISM_GOOGLE_CALENDAR_ID="${CHATPRISM_GOOGLE_CALENDAR_ID:-zhouquan2k@gmail.com}"
CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID="${CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID:-494254467223-f7q18ga1dd331pmci8uv8qp3oma13b4v.apps.googleusercontent.com}"
CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET="${CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET:-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}"
CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN="${CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN:-1//05m2ofsseGiz0CgYIARAAGAUSNwF-L9IrI8wBFDlqGxPHybuUBj7iWb4Wv3BGTjYi5UENfUlypPlPVVQeD9IYD4UYUwO7sEGogUg}"
VERIFY_BASE_URL="${VERIFY_BASE_URL:-http://100.110.154.91:8787}"
VERIFY_SYNC_KEY="${VERIFY_SYNC_KEY:-dev-local}"
DRY_RUN="${DRY_RUN:-0}"

# "remote" (default): rsync source-only to the NAS and build the image there
# with the NAS's own (native amd64, no emulation) Docker daemon — only the
# incremental source diff crosses the network, and the NAS's layer cache is
# reused across deploys. "local": build with buildx on this machine and
# stream the full image via `docker save | ssh ... docker load` (kept as a
# fallback for when the NAS build environment is unavailable).
BUILD_MODE="${BUILD_MODE:-remote}"
REMOTE_BUILD_DIR="${REMOTE_BUILD_DIR:-/volume1/docker/jarvis/build/JARVIS}"

# Local dev artifacts and caches that must never be synced to the NAS build
# context: pnpm's local content store, the local dev sync DB, and browser
# probe profiles are multi-GB and irrelevant to the image build.
RSYNC_EXCLUDES=(
    --exclude node_modules
    --exclude .git
    --exclude dist
    --exclude .pnpm-store
    --exclude apps/server/.data
    --exclude apps/desktop2/.dom-probe-profile
    --exclude apps/desktop2/playwright-report
    --exclude apps/web2/playwright-report
    --exclude apps/web2/test-results
    --exclude .playwright-mcp
    --exclude .turbo
)

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

log() {
    printf '[deploy-nas] %s\n' "$*"
}

run() {
    log "$*"
    if [[ "$DRY_RUN" == "1" ]]; then
        return 0
    fi
    "$@"
}

run_remote() {
    local remote_cmd="$1"
    log "ssh ${NAS_HOST} ${remote_cmd}"
    if [[ "$DRY_RUN" == "1" ]]; then
        return 0
    fi
    ssh "${NAS_HOST}" "${remote_cmd}"
}

run_in_root() {
    local cmd=("$@")
    log "(cd ${ROOT_DIR} && ${cmd[*]})"
    if [[ "$DRY_RUN" == "1" ]]; then
        return 0
    fi
    (
        cd "${ROOT_DIR}"
        "${cmd[@]}"
    )
}

require_command docker
require_command ssh
require_command curl

if [[ "${BUILD_MODE}" == "remote" ]]; then
    require_command rsync

    log "Syncing source to ${NAS_HOST}:${REMOTE_BUILD_DIR}"
    rsync_cmd=(
        rsync -az --delete
        --rsync-path="${NAS_RSYNC_BIN}"
        "${RSYNC_EXCLUDES[@]}"
        -e ssh
        "${ROOT_DIR}/"
        "${NAS_HOST}:${REMOTE_BUILD_DIR}/"
    )
    run "${rsync_cmd[@]}"

    log "Building ${IMAGE_TAG} on ${NAS_HOST} (native, no emulation)"
    run_remote "cd ${REMOTE_BUILD_DIR} && ${NAS_DOCKER_BIN} build -t ${IMAGE_TAG} ."
elif [[ "${BUILD_MODE}" == "local" ]]; then
    require_command docker

    log "Building ${IMAGE_TAG} for ${PLATFORM} (local, via buildx)"
    run_in_root docker buildx build --platform "${PLATFORM}" -t "${IMAGE_TAG}" --load .

    log "Streaming image to NAS"
    if [[ "$DRY_RUN" == "1" ]]; then
        log "docker save ${IMAGE_TAG} | ssh ${NAS_HOST} '${NAS_DOCKER_BIN} load'"
    else
        docker save "${IMAGE_TAG}" | ssh "${NAS_HOST}" "${NAS_DOCKER_BIN} load"
    fi
else
    echo "Unknown BUILD_MODE: ${BUILD_MODE} (expected 'remote' or 'local')" >&2
    exit 1
fi

run_remote "${NAS_DOCKER_BIN} stop ${CONTAINER_NAME} >/dev/null 2>&1 || true"
run_remote "${NAS_DOCKER_BIN} rm ${CONTAINER_NAME} >/dev/null 2>&1 || true"

docker_run_cmd=(
    "${NAS_DOCKER_BIN}"
    run
    -d
    --name "${CONTAINER_NAME}"
    -p "${HOST_PORT}:8787"
    -v "${NAS_DATA_DIR}:/data"
    -v "${NAS_KNOWLEDGE_DIR}:/knowledge"
    -e "CHATPRISM_SYNC_ALLOWED_ORIGINS=${SYNC_ALLOWED_ORIGINS}"
)

if [[ -n "${CHATPRISM_GOOGLE_CALENDAR_ID}" ]]; then
    docker_run_cmd+=(-e "CHATPRISM_GOOGLE_CALENDAR_ID=${CHATPRISM_GOOGLE_CALENDAR_ID}")
fi

if [[ -n "${CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID}" ]]; then
    docker_run_cmd+=(-e "CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID=${CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID}")
fi

if [[ -n "${CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET}" ]]; then
    docker_run_cmd+=(-e "CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET=${CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET}")
fi

if [[ -n "${CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN}" ]]; then
    docker_run_cmd+=(-e "CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN=${CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN}")
fi

docker_run_cmd+=("${IMAGE_TAG}")

printf -v remote_run_cmd '%q ' "${docker_run_cmd[@]}"
run_remote "${remote_run_cmd% }"

log "Verifying health and sync endpoints"
run curl -m 8 -fsS "${VERIFY_BASE_URL}/health"
run curl -m 8 -fsS -H "x-sync-key: ${VERIFY_SYNC_KEY}" -H "content-type: application/json" \
  -d '{"cursor":0}' "${VERIFY_BASE_URL}/api/sync/pull"
run curl -m 8 -fsS -H "x-sync-key: ${VERIFY_SYNC_KEY}" -H "content-type: application/json" \
  -d '{"cursor":0}' "${VERIFY_BASE_URL}/api/sync/tasks/pull"

log "Deployment complete"
