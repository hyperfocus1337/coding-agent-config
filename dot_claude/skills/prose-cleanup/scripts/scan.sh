#!/usr/bin/env bash
# Pick the prose files for a cleanup and lint them in one check.sh run, so the
# exit code tells an alert from a Vale failure: fd -X and xargs would replace it.
#   scan.sh              the prose files in the repository (the current directory
#                        outside git)
#   scan.sh PATH...      the named files (a .txt file too), and the prose files
#                        in the named directories
#   scan.sh --changed    the prose files that differ from HEAD
# Prints one path:line:column:rule:message row per alert. Exits 0 on no alert,
# 1 on alerts, and 2 when the scan did not run: no vale, a bad path, or a Vale
# failure such as a broken rule.

# --- Paths and extensions ---
set -uo pipefail
# The shared Vale config and scripts/check.sh. The test points it at the chezmoi source.
check=${LINT_PROSE_VALE_DIR:-$HOME/.config/vale}/scripts/check.sh
# The hook's extensions, without .txt: a .txt file in a directory is often a log.
exts=(md markdown org html htm)

# --- Preflight ---
die() { echo "scan.sh: $1" >&2; exit 2; }
[[ -f "$check" ]] || die "no check.sh at $check"
vale --version >/dev/null 2>&1 || die "vale is not installed, or does not run"

# --- Collect files ---
files=()
if [[ "${1-}" == --changed ]]; then
  root=$(git rev-parse --show-toplevel 2>/dev/null) || die "--changed needs a git repository"
  while IFS= read -r -d '' f; do files+=("$root/$f"); done < <(
    git -C "$root" diff --name-only --diff-filter=d -z HEAD -- "${exts[@]/#/*.}")
else
  (($#)) || set -- "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  for p; do
    if [[ -d "$p" ]]; then
      while IFS= read -r -d '' f; do files+=("$f"); done < <(
        fd -0 -t f "${exts[@]/#/-e}" . "$p")
    elif [[ -f "$p" ]]; then
      files+=("$p")
    else
      die "no such file or directory: $p"
    fi
  done
fi

# --- Lint ---
((${#files[@]})) || { echo "scan.sh: no prose files" >&2; exit 0; }
bash "$check" "${files[@]}"
