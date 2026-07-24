#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)

if ! command -v docker > /dev/null; then
  printf '未找到 docker 命令。\n' >&2
  exit 1
fi

assert_insecure_http_value() {
  local config_json=$1
  local expected_value=$2

  printf '%s\n' "$config_json" | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const expectedValue = process.argv[1];
  let config;

  try {
    config = JSON.parse(input);
  } catch (error) {
    console.error(`无法解析 docker compose JSON: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const environment = config.services?.["tvcmall-mcp"]?.environment;
  let actualValue;
  if (Array.isArray(environment)) {
    const prefix = "TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=";
    const entry = environment.find(
      (value) => typeof value === "string" && value.startsWith(prefix),
    );
    actualValue = entry?.slice(prefix.length);
  } else if (environment && typeof environment === "object") {
    actualValue = environment.TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP;
  }

  if (typeof actualValue !== "string" || actualValue !== expectedValue) {
    console.error(
      `TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP 应为字符串 ${JSON.stringify(expectedValue)}，实际为 ${JSON.stringify(actualValue)}`,
    );
    process.exitCode = 1;
  }
});
' "$expected_value"
}

assert_compose_file() {
  local environment=$1
  local compose_file="$repo_root/compose.$environment.yaml"
  local default_config
  local insecure_http_config

  default_config=$(
    unset TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP
    TVCMALL_MCP_IMAGE='registry.example/tvcmall/tvcmall-mcp:abc1234' \
      TVCMALL_WEBAPI_BASE_URL='https://webapi.example.com/api' \
        docker compose -f "$compose_file" --env-file /dev/null config --format json
  )
  assert_insecure_http_value "$default_config" false

  insecure_http_config=$(TVCMALL_MCP_IMAGE='registry.example/tvcmall/tvcmall-mcp:abc1234' \
    TVCMALL_WEBAPI_BASE_URL='http://webapi.example.com/api' \
    TVCMALL_ALLOW_INSECURE_WEBAPI_HTTP=true \
      docker compose -f "$compose_file" --env-file /dev/null config --format json)
  assert_insecure_http_value "$insecure_http_config" true

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
