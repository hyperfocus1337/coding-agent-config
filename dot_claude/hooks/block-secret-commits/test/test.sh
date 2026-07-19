#!/usr/bin/env bash
# Smoke test for the is_dangerous classifier in hook.sh.
# Run: bash test.sh   (sourcing hook.sh stops at the guard, so only the
# function loads — no stdin read, no repo scan).
# shellcheck disable=SC2317  # sourced guard confuses reachability analysis
# shellcheck disable=SC1091  # source path resolves at runtime, not lint time
set -u
# shellcheck source=../hook.sh
source "$(dirname "$0")/../hook.sh"

fail=0
blocked() { if is_dangerous "$1"; then echo "ok   block  $1"; else echo "FAIL allow  $1"; fail=1; fi; }
allowed() { if is_dangerous "$1"; then echo "FAIL block  $1"; fail=1; else echo "ok   allow  $1"; fi; }

# real secrets → must block
blocked .env
blocked .env.local
blocked .envrc
blocked id_rsa
blocked id_ed25519
blocked server.pem
blocked private.key
blocked bundle.p12
blocked credentials.json
blocked .git-credentials
blocked .netrc
blocked cluster.kubeconfig

# templates + ordinary files → must allow
allowed .env.example
allowed .env.sample
allowed .env.template
allowed main.go
allowed README.md
allowed config.yaml

if [ "$fail" -eq 0 ]; then echo "all pass"; else echo "FAILURES"; exit 1; fi
