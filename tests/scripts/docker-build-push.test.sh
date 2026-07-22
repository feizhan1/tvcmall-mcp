#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
script_path="$repo_root/scripts/docker-build-push.sh"
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT

mkdir -p "$temp_dir/bin"
cat > "$temp_dir/bin/docker" <<'EOF'
#!/usr/bin/env sh
printf '%s\n' "$*" >> "$DOCKER_LOG"
EOF
chmod +x "$temp_dir/bin/docker"

export DOCKER_LOG="$temp_dir/docker.log"
export PATH="$temp_dir/bin:$PATH"

IMAGE_REPOSITORY='registry.example/tvcmall/tvcmall-mcp' \
IMAGE_TAG='abc1234' \
IMAGE_PLATFORM='linux/amd64' \
  "$script_path" > "$temp_dir/output.txt"

assert_log_contains() {
  if ! rg --fixed-strings --quiet -- "$1" "$DOCKER_LOG"; then
    printf 'Missing Docker command: %s\n' "$1" >&2
    cat "$DOCKER_LOG" >&2
    exit 1
  fi
}

assert_log_contains "build --platform linux/amd64 -t registry.example/tvcmall/tvcmall-mcp:abc1234 -t registry.example/tvcmall/tvcmall-mcp:latest $repo_root"
assert_log_contains 'push registry.example/tvcmall/tvcmall-mcp:abc1234'
assert_log_contains 'push registry.example/tvcmall/tvcmall-mcp:latest'
rg --fixed-strings --quiet -- '已推送镜像：registry.example/tvcmall/tvcmall-mcp:abc1234' "$temp_dir/output.txt"
