#!/usr/bin/env bash
# Pick the prose files for a cleanup and lint them in one check.sh run, so the
# exit code tells an alert from a Vale failure: fd -X and xargs would replace it.
#   scan.sh              the prose files in the repository (the current directory
#                        outside git)
#   scan.sh PATH...      the named files (a .txt file too), and the prose files
#                        in the named directories
#   scan.sh --changed    the prose files that differ from HEAD
#   --config FILE        lint with another Vale config instead of the hook's
#                        rules; "--config repo" takes the repository's own
#                        .vale.ini or _vale.ini. Combines with each form above.
# Prints one path:line:column:rule:message row per alert. Exits 0 on no alert,
# 1 on alerts, and 2 when the scan did not run: no vale, a bad path or config,
# or a Vale failure such as a broken rule.

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

# --- Options ---
changed=0 config= paths=()
while (($#)); do
  case $1 in
    --changed) changed=1 ;;
    --config) (($# > 1)) || die "--config needs a file, or repo"; config=$2; shift ;;
    --config=*) config=${1#--config=} ;;
    -*) die "unknown option: $1" ;;
    *) paths+=("$1") ;;
  esac
  shift
done
((changed && ${#paths[@]})) && die "--changed takes no paths"
root=$(git rev-parse --show-toplevel 2>/dev/null)

# --- Config ---
if [[ "$config" == repo ]]; then
  config=
  for f in "${root:-$PWD}"/{.vale.ini,_vale.ini}; do
    [[ -f "$f" ]] && { config=$f; break; }
  done
  [[ -n "$config" ]] || die "no .vale.ini or _vale.ini in ${root:-$PWD}"
fi
if [[ -n "$config" ]]; then
  [[ -f "$config" ]] || die "no such config: $config"
  config=$(realpath "$config")
  # Vale stops on a StylesPath that does not exist, and sync creates it. When
  # sync fails, such as offline, the packages already in StylesPath still work.
  if grep -Eq '^[[:space:]]*Packages[[:space:]]*=' "$config"; then
    synced=$(vale --no-global --config "$config" sync 2>&1) ||
      echo "scan.sh: vale sync failed, so the scan uses the installed packages: $synced" >&2
  fi
  export PROSE_VALE_CONFIG=$config
fi

# --- Collect files ---
files=()
if ((changed)); then
  [[ -n "$root" ]] || die "--changed needs a git repository"
  while IFS= read -r -d '' f; do files+=("$root/$f"); done < <(
    git -C "$root" diff --name-only --diff-filter=d -z HEAD -- "${exts[@]/#/*.}")
else
  ((${#paths[@]})) || paths=("${root:-$PWD}")
  for p in "${paths[@]}"; do
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
out=$(bash "$check" "${files[@]}")
status=$?
[[ -n "$out" ]] && printf '%s\n' "$out"
# Vale exits 1 only on an error alert. A package rule at warning or suggestion
# level, such as most of Readability, prints an alert and exits 0.
((status == 0)) && [[ -n "$out" ]] && status=1
exit "$status"
