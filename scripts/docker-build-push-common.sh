#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
image_repository=${IMAGE_REPOSITORY:-}
image_platform=${IMAGE_PLATFORM:-linux/amd64}

if [[ -n "${IMAGE_TAG:-}" ]]; then
  image_tag=$IMAGE_TAG
elif ! image_tag=$(git -C "$repo_root" rev-parse --short=7 HEAD); then
  printf '无法取得 Git 提交标签，请通过 IMAGE_TAG 显式指定。\n' >&2
  exit 1
fi

if [[ -z "$image_repository" || -z "$image_tag" || -z "$image_platform" ]]; then
  printf 'IMAGE_REPOSITORY、IMAGE_TAG 和 IMAGE_PLATFORM 均不能为空。\n' >&2
  exit 1
fi

if ! command -v docker > /dev/null; then
  printf '未找到 docker 命令，请先安装并启动 Docker。\n' >&2
  exit 1
fi

image_with_tag="$image_repository:$image_tag"
image_latest="$image_repository:latest"

printf '构建镜像：%s（平台：%s）\n' "$image_with_tag" "$image_platform"
docker build --platform "$image_platform" \
  -t "$image_with_tag" \
  -t "$image_latest" \
  "$repo_root"

printf '推送镜像：%s\n' "$image_with_tag"
docker push "$image_with_tag"

printf '推送镜像：%s\n' "$image_latest"
docker push "$image_latest"

printf '已推送镜像：%s\n' "$image_with_tag"
