#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)

if ! command -v docker > /dev/null; then
  printf '未找到 docker 命令。\n' >&2
  exit 1
fi

assert_compose_file() {
  local environment=$1
  local compose_file="$repo_root/compose.$environment.yaml"

  TVCMALL_MCP_IMAGE='registry.example/tvcmall/tvcmall-mcp:abc1234' \
  TVCMALL_WEBAPI_BASE_URL='https://webapi.example.com/api' \
    docker compose -f "$compose_file" config --quiet

  rg --fixed-strings --quiet -- 'image: ${TVCMALL_MCP_IMAGE:?' "$compose_file"
  rg --fixed-strings --quiet -- "TVCMALL_API_ENV: $environment" "$compose_file"
  rg --fixed-strings --quiet -- 'restart: unless-stopped' "$compose_file"
  rg --fixed-strings --quiet -- '${TVCMALL_MCP_BIND_ADDRESS:-127.0.0.1}:${TVCMALL_MCP_PORT:-8090}:3000' "$compose_file"
  rg --fixed-strings --quiet -- 'healthcheck:' "$compose_file"
  if rg --fixed-strings --quiet -- 'TVCMALL_API_KEY' "$compose_file"; then
    printf 'Compose 配置不得包含 TVCMALL_API_KEY。\n' >&2
    exit 1
  fi
}

assert_compose_file staging
assert_compose_file production

if [[ -e "$repo_root/compose.yaml" ]]; then
  printf '不应保留未区分环境的 compose.yaml。\n' >&2
  exit 1
fi
