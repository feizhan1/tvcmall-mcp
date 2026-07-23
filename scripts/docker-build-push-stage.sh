#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
export IMAGE_REPOSITORY=${IMAGE_REPOSITORY:-crpi-xjd40982wqk3bdon.cn-shenzhen.personal.cr.aliyuncs.com/tvcmall/tvcmall-mcp}

exec "$script_dir/docker-build-push-common.sh"
