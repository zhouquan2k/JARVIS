#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NAS_HOST="${NAS_HOST:-nas}"
NAS_DOCKER_BIN="${NAS_DOCKER_BIN:-/volume1/@appstore/Docker/usr/bin/docker}"
IMAGE_TAG="${IMAGE_TAG:-jarvis-server:amd64}"
PLATFORM="${PLATFORM:-linux/amd64}"
CONTAINER_NAME="${CONTAINER_NAME:-jarvis-server}"
HOST_PORT="${HOST_PORT:-8787}"
NAS_DATA_DIR="${NAS_DATA_DIR:-/volume1/docker/jarvis/data}"
NAS_KNOWLEDGE_DIR="${NAS_KNOWLEDGE_DIR:-/var/services/homes/zhouquan/dropbox/MyDocuments}"
SYNC_ALLOWED_ORIGINS="${SYNC_ALLOWED_ORIGINS:-http://192.168.1.4:8787,http://100.110.154.91:8787}"
VERIFY_BASE_URL="${VERIFY_BASE_URL:-http://100.110.154.91:8787}"
VERIFY_SYNC_KEY="${VERIFY_SYNC_KEY:-dev-local}"
DRY_RUN="${DRY_RUN:-0}"

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

log "Building ${IMAGE_TAG} for ${PLATFORM}"
run_in_root docker buildx build --platform "${PLATFORM}" -t "${IMAGE_TAG}" --load .

log "Streaming image to NAS"
if [[ "$DRY_RUN" == "1" ]]; then
    log "docker save ${IMAGE_TAG} | ssh ${NAS_HOST} '${NAS_DOCKER_BIN} load'"
else
    docker save "${IMAGE_TAG}" | ssh "${NAS_HOST}" "${NAS_DOCKER_BIN} load"
fi

run_remote "${NAS_DOCKER_BIN} stop ${CONTAINER_NAME} >/dev/null 2>&1 || true"
run_remote "${NAS_DOCKER_BIN} rm ${CONTAINER_NAME} >/dev/null 2>&1 || true"

run_remote "${NAS_DOCKER_BIN} run -d --name ${CONTAINER_NAME} -p ${HOST_PORT}:8787 \
  -v ${NAS_DATA_DIR}:/data \
  -v ${NAS_KNOWLEDGE_DIR}:/knowledge \
  -e CHATPRISM_SYNC_ALLOWED_ORIGINS=${SYNC_ALLOWED_ORIGINS} \
  ${IMAGE_TAG}"

log "Verifying health and sync endpoints"
run curl -m 8 -fsS "${VERIFY_BASE_URL}/health"
run curl -m 8 -fsS -H "x-sync-key: ${VERIFY_SYNC_KEY}" -H "content-type: application/json" \
  -d '{"cursor":0}' "${VERIFY_BASE_URL}/api/sync/pull"
run curl -m 8 -fsS -H "x-sync-key: ${VERIFY_SYNC_KEY}" -H "content-type: application/json" \
  -d '{"cursor":0}' "${VERIFY_BASE_URL}/api/sync/tasks/pull"

log "Deployment complete"
