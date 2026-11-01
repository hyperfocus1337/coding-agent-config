#!/usr/bin/env bash
# Install templates/web/mise.toml the way templates/web/bootstrap.sh does, in
# amd64 and arm64 containers that block the hosts the cloud refuses. Run it
# after you change mise.toml or mise.lock, before you push. Its mise steps
# mirror bootstrap.sh, so change both together. Needs docker.
set -euo pipefail

WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../templates/web" && pwd)"

version="$(sed -n 's/^MISE_VERSION="\(.*\)"$/\1/p' "$WEB/bootstrap.sh")"
for platform in linux/amd64 linux/arm64; do
  echo "==> $platform"
  docker run -i -u node --platform "$platform" -v "$WEB:/web:ro" \
    --add-host api.github.com:0.0.0.0 --add-host mise-versions.jdx.dev:0.0.0.0 \
    --add-host mise.jdx.dev:0.0.0.0 --add-host mise.run:0.0.0.0 \
    --rm node:22-bookworm bash -euo pipefail -c '
      npm install -g --prefix "$HOME/.local" --silent "mise@$1"
      export PATH="$HOME/.local/bin:$PATH" MISE_LOCKED=true MISE_USE_VERSIONS_HOST=false
      mise -C /web install
      mise -C /web ls --current' _ "$version"
done
