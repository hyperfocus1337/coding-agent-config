#!/bin/bash

set -e

# Update APM only if a newer version exists. `apm self-update` always installs
# to /usr/local/bin, but the apm on PATH usually lives elsewhere and shadows it,
# so the update never takes and every run loops. Update through the channel that
# owns the on-PATH binary instead.
if command -v brew >/dev/null 2>&1 && brew list --formula apm >/dev/null 2>&1; then
  # macOS: apm is a Homebrew formula under the brew prefix. Upgrade via brew so
  # the binary that actually gets updated is the one on PATH.
  if [ -n "$(brew outdated --formula apm)" ]; then
    echo "==> Updating APM (via Homebrew)"
    HOMEBREW_NO_AUTO_UPDATE=1 brew upgrade apm
  else
    echo "==> APM already up to date"
  fi
elif apm self-update --check 2>&1 | grep -qi "update available"; then
  # Linux containers (no brew): the on-PATH apm is in ~/.local/bin. Point
  # APM_INSTALL_DIR at its directory so self-update lands there, not in
  # /usr/local/bin. This also avoids the sudo prompt.
  echo "==> Updating APM"
  APM_INSTALL_DIR="$(dirname "$(command -v apm)")" apm self-update
else
  echo "==> APM already up to date"
fi
