#!/usr/bin/env bash
# Claude Code Stop hook of this repository, set in .claude/settings.json. Runs the test/check.ts
# of each hook folder with uncommitted changes, and of each hook whose test imports such a folder,
# such as toggle-hook. Exit 2 sends the failures to the agent. On the stop after that
# (stop_hook_active), it only reports them, so the agent can end the turn. `just hooks-check`
# runs the full check, with tsc and claude plugin validate.
# shortcut: runs for every uncommitted hook change, not only the changes of this turn; read the
# track-session-changes log when the reruns cost too much.
set -uo pipefail

active="$(jq -r '.stop_hook_active // false' 2>/dev/null)"
cd "$(dirname "${BASH_SOURCE[0]}")/../../.." || exit 0
command -v node >/dev/null || exit 0

dirs=()
codex=0
# Adds a hook folder once, when it has a test.
add() {
  case " ${dirs[*]-} " in *" $1 "*) return ;; esac
  [[ -f $1/test/check.ts ]] && dirs+=("$1")
}
# A while-read loop, not mapfile, because macOS ships bash 3.2.
while IFS= read -r path; do
  case $path in
    dot_claude/hooks/*/*) rest=${path#dot_claude/hooks/} dir=dot_claude/hooks/${rest%%/*} ;;
    dot_config/git/hooks/*/*) rest=${path#dot_config/git/hooks/} dir=dot_config/git/hooks/${rest%%/*} ;;
    dot_codex/hooks/*)
      codex=1
      continue
      ;;
    *) continue ;;
  esac
  add "$dir"
  while IFS= read -r test; do add "${test%/test/*}"; done < <(
    grep -lF "../../${dir##*/}/" dot_claude/hooks/*/test/*.ts dot_config/git/hooks/*/test/*.ts 2>/dev/null
  )
done < <({
  git diff --name-only HEAD
  git ls-files --others --exclude-standard
} | sort -u)

report=""
for dir in ${dirs[@]+"${dirs[@]}"}; do
  out="$(cd "$dir" && node test/check.ts 2>&1)" ||
    report+="FAILED: $dir/test/check.ts"$'\n'"$(tail -n 30 <<<"$out")"$'\n'
done
if ((codex)); then
  out="$(node dot_codex/hooks/test/apply-patch.ts 2>&1)" ||
    report+="FAILED: dot_codex/hooks/test/apply-patch.ts"$'\n'"$(tail -n 30 <<<"$out")"$'\n'
fi
[[ -z $report ]] && exit 0
if [[ $active == true ]]; then
  jq -n --arg m "Hook tests still fail:"$'\n'"$report" '{systemMessage: $m}'
  exit 0
fi
printf 'Hook tests failed. Fix them, rerun the failed test, then stop.\n%s' "$report" >&2
exit 2
