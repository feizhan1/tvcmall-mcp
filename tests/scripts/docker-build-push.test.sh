#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
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

assert_script() {
  local environment=$1
  local image_repository=$2
  local script_path="$repo_root/scripts/docker-build-push-$environment.sh"

  : > "$DOCKER_LOG"
  IMAGE_TAG='abc1234' IMAGE_PLATFORM='linux/amd64' \
    "$script_path" > "$temp_dir/$environment-output.txt"

  assert_log_contains "build --platform linux/amd64 -t $image_repository:abc1234 -t $image_repository:latest $repo_root"
  assert_log_contains "push $image_repository:abc1234"
  assert_log_contains "push $image_repository:latest"
  rg --fixed-strings --quiet -- "已推送镜像：$image_repository:abc1234" "$temp_dir/$environment-output.txt"
}

assert_log_contains() {
  if ! rg --fixed-strings --quiet -- "$1" "$DOCKER_LOG"; then
    printf 'Missing Docker command: %s\n' "$1" >&2
    cat "$DOCKER_LOG" >&2
    exit 1
  fi
}

assert_script stage 'crpi-xjd40982wqk3bdon.cn-shenzhen.personal.cr.aliyuncs.com/tvcmall/tvcmall-mcp'
assert_script product 'crpi-xjd40982wqk3bdon.cn-shenzhen.personal.cr.aliyuncs.com/tvcmall/tvcmall-product-mcp'

if [[ -e "$repo_root/scripts/docker-build-push.sh" ]]; then
  printf '不应保留未区分环境的 docker-build-push.sh。\n' >&2
  exit 1
fi
