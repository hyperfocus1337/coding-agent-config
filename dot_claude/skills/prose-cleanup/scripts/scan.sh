#!/usr/bin/env bash
# Pick the prose files for a cleanup and lint them in one check.sh run, so the
# exit code tells an alert from a Vale failure: fd -X and xargs would replace it.
#   scan.sh [--all]      the prose files in the repository (the current directory
#                        outside git)
#   scan.sh PATH...      the named files (a .txt file too), and the prose files
#                        in the named directories
#   scan.sh --changed    the prose files that differ from HEAD
#   --config FILE        lint with another Vale config instead of the hook's
#                        rules. Combines with each form above.
# Writes a report file with one path:line:column:rule:message row per alert,
# with absolute paths, and prints its path and the alert counts per file and
# per rule. Exits 0 on no alert, 1 on alerts, and 2 when the scan did not run:
# no vale, a bad path or config, or a Vale failure such as a broken rule.

# --- Paths and extensions ---
set -uo pipefail
# The shared Vale config and scripts/check.sh. The test points it at the chezmoi source.
check=${LINT_PROSE_VALE_DIR:-$HOME/.config/vale}/scripts/check.sh
# The hook's extensions, without .txt: a .txt file in a directory is often a log.
exts=(md markdown org html htm)

# --- Preflight ---
die() {
  echo "scan.sh: $1" >&2
  exit 2
}
[[ -f "$check" ]] || die "no check.sh at $check"
vale --version >/dev/null 2>&1 || die "vale is not installed, or does not run"

# --- Options ---
all=0 changed=0 config='' paths=()
while (($#)); do
  case $1 in
    --all) all=1 ;;
    --changed) changed=1 ;;
    --config)
      (($# > 1)) || die "--config needs a file"
      config=$2
      shift
      ;;
    --config=*) config=${1#--config=} ;;
    -*) die "unknown option: $1" ;;
    *) paths+=("$1") ;;
  esac
  shift
done
((all + changed + (${#paths[@]} > 0) > 1)) && die "give one scope: --all, paths, or --changed"
root=$(git rev-parse --show-toplevel 2>/dev/null)
# Physical, like the git root, so the counts can show paths relative to it.
base=${root:-$(pwd -P)}
if ((changed)); then
  scope=--changed kind=changed
elif ((${#paths[@]})); then
  scope=${paths[*]} kind=paths
else
  scope="all prose files" kind=all
fi

# --- Config ---
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
    git -C "$root" diff --name-only --diff-filter=d -z HEAD -- "${exts[@]/#/*.}"
  )
else
  ((${#paths[@]})) || paths=("$base")
  for p in "${paths[@]}"; do
    [[ -e "$p" ]] || die "no such file or directory: $p"
    # Absolute, so the report rows open from any directory.
    p=$(realpath "$p")
    if [[ -d "$p" ]]; then
      while IFS= read -r -d '' f; do files+=("$f"); done < <(
        fd -0 -t f "${exts[@]/#/-e}" . "$p"
      )
    else
      files+=("$p")
    fi
  done
fi

# --- Lint ---
out='' status=0
if ((${#files[@]})); then
  out=$(bash "$check" "${files[@]}")
  status=$?
else
  echo "scan.sh: no prose files" >&2
fi
((status > 1)) && die "vale failed: $out"
# Vale exits 1 only on an error alert. A package rule at warning or suggestion
# level, such as most of Readability, prints an alert and exits 0.
((status == 0)) && [[ -n "$out" ]] && status=1

# --- Report ---
# One directory per repository, named after its path under $HOME with each /
# as -, without a leading . or -. One file per scan, named after the time, the
# scope kind, and the config file without .ini: only reports with the same
# kind and config compare.
# shortcut: a second scan in the same second replaces the first report; add a
# counter to the name if a script ever calls scan.sh in a loop.
dir=${base#"$HOME"/}
dir=${dir//\//-}
dir=${XDG_STATE_HOME:-$HOME/.local/state}/prose-cleanup/${dir#[.-]}
mkdir -p "$dir" || die "cannot create $dir"
name=$(date +%Y%m%d-%H%M%S)-$kind
if [[ -n "$config" ]]; then
  stem=$(basename "$config" .ini)
  name+=-${stem#.}
fi
report=$dir/$name.txt
count=0 per_file='' per_rule=''
if [[ -n "$out" ]]; then
  count=$(wc -l <<<"$out" | tr -d ' ')
  per_file=$(cut -d: -f1 <<<"$out" | awk -v b="$base/" 'index($0, b) == 1 { $0 = substr($0, length(b) + 1) } 1' |
    sort | uniq -c | sort -rn)
  per_rule=$(cut -d: -f4 <<<"$out" | sort | uniq -c | sort -rn)
  count="$count in $(wc -l <<<"$per_file" | tr -d ' ') files"
fi
{
  echo '-*- mode: grep -*-'
  echo "root:   $base"
  echo "scope:  $scope"
  echo "config: ${config:-the lint-prose hook rules}"
  echo "alerts: $count"
  if [[ -n "$out" ]]; then printf '\n%s\n' "$out"; fi
} >"$report" || die "cannot write $report"

echo "report: $report"
echo "alerts: $count"
if [[ -n "$out" ]]; then printf 'per file:\n%s\nper rule:\n%s\n' "$per_file" "$per_rule"; fi
exit "$status"
