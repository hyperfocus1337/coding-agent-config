#!/usr/bin/env bash
# Blocks a `git commit` that would commit a secret. Two checks: a binary scan
# for files the staged scan cannot read, and a betterleaks scan for secret
# values and secret file names.
#
# Reasoning, measurements and rejected alternatives: docs/implementation.md
# Behaviour and escape hatches: README.md
set -u

# --- Allow / deny helpers ---
# One exit path for two hosts: Cursor reads the JSON verdict, Claude Code reads
# the exit code. docs/implementation.md#host-contract
allow() { printf '{"permission":"allow"}\n'; exit 0; }
# Pass deny a static string. Cursor fails open on malformed JSON, so a filename
# holding a " or a newline must never reach it; paths go to stderr instead.
deny() { printf '{"permission":"deny","agent_message":"%s"}\n' "$1"; exit 2; }

# --- Trigger filter ---
# `git commit` only, matched in the raw payload: two bash pattern tests keep an
# ordinary Bash tool call at ~0.6ms, where a jq spawn would cost 8ms.
# docs/implementation.md#trigger-filter
IFS= read -r -d '' payload
[[ $payload == *git* ]] || allow
# `commit` must be a whole word. The separator class carries the JSON escapes
# as well as real whitespace, because the payload is raw JSON where a newline
# arrives as the two characters \n.
[[ $payload =~ ([[:space:]]|\\[nrt])commit([^[:alnum:]_-]|$) ]] || allow

# --- Repo root ---
# Both scans run against the current directory, so move there first. A failed cd
# means no such directory, which allows. docs/implementation.md#repo-root
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || allow

# --- Allowlist overrides ---
# Two additive sources feed one newline-delimited string: the
# .claude-allow-secrets file and the CLAUDE_ALLOW_SECRETS variable. is_allowed
# is the single definition of "allowed" for both scans, but it exists for the
# binary scan, which no betterleaks setting can exempt.
# docs/implementation.md#why-this-list-exists-at-all
allowlist=$'\n'
if [ -f "$root/.claude-allow-secrets" ]; then
  while IFS= read -r line; do
    case $line in ''|'#'*) continue ;; esac # skip blank and comment lines
    allowlist+="$line"$'\n'
  done < "$root/.claude-allow-secrets"
fi
[ -n "${CLAUDE_ALLOW_SECRETS:-}" ] &&
  allowlist+="${CLAUDE_ALLOW_SECRETS//[[:space:]:]/$'\n'}"$'\n'

is_allowed() { # $1 = repo-relative path; allowed if the path or its basename is listed
  [[ $allowlist == *$'\n'"$1"$'\n'* || $allowlist == *$'\n'"${1##*/}"$'\n'* ]]
}

# --- betterleaks availability and config ---
# conf/betterleaks.toml holds the file-name rules. It sits next to this script
# because betterleaks has no XDG lookup. Ask betterleaks which config it would
# pick rather than re-implementing its precedence table: "default" means nothing
# else selected one, so this hook may contribute its own.
# docs/implementation.md#config-resolution
has_bl=0
command -v betterleaks >/dev/null 2>&1 && has_bl=1
bl_cfg=()
if [ "$has_bl" -eq 1 ] && [ "$(betterleaks config path 2>/dev/null)" = default ]; then
  cfg="${BASH_SOURCE[0]%/*}/conf/betterleaks.toml"
  [ -f "$cfg" ] && bl_cfg=(--config "$cfg")
fi

# Bounds every scan. Load-bearing: do NOT swap for betterleaks' own --timeout,
# which aborts and exits 0, turning a truncated scan into a silent pass.
# docs/implementation.md#scan-cap
bl_cap=4

# --- Binary scan ---
# betterleaks skips a binary blob in git mode, so a keystore reaches the commit
# unread. `--numstat` prints "-\t-" for a blob git cannot diff as text, which is
# the same NUL-byte test betterleaks uses to skip it, so this selects exactly
# what the staged scan misses. The verdict is then delegated to `betterleaks
# dir`, which does read binaries, so an ordinary PNG commits freely and only a
# real finding blocks. docs/implementation.md#binary-scan
bl_dir() { # <path>... -> 0 only when every path scans clean; nonzero also on error
  timeout "$bl_cap" betterleaks dir "$@" ${bl_cfg[@]+"${bl_cfg[@]}"} \
    --no-banner --redact --log-level error --exit-code 9 -f json -r /dev/null >/dev/null 2>&1
}

# Largest file this hook copies to a neutral name. Above it the copy costs more
# than the gap it closes, so the file keeps its own path and its extension may
# exempt it. docs/implementation.md#the-extension-allowlist
bl_copy_max=$((100 * 1024 * 1024))

scan_binary() {
  local rec f i stage='' scan=() real=() offenders=()
  while IFS= read -r -d '' rec; do
    case $rec in $'-\t-\t'*) ;; *) continue ;; esac
    f=${rec#$'-\t-\t'}
    is_allowed "$f" && continue
    # `dir` reads the worktree, so a file staged and then removed from it cannot
    # be scanned. Unreadable or unscannable means unverifiable, which blocks.
    if [ "$has_bl" -eq 1 ] && [ -r "$f" ]; then real+=("$f"); else offenders+=("$f"); fi
  done < <(git diff --cached --numstat -z --diff-filter=A 2>/dev/null)

  if [ ${#real[@]} -gt 0 ]; then
    # The default config exempts image, font and office extensions from every
    # rule, so a key inside logo.png or a password list inside notes.xlsx scans
    # clean. Copying each file to a neutral name defeats that path allowlist.
    # Measured on 300 real images, fonts and PDFs: no false positive.
    # docs/implementation.md#the-extension-allowlist
    stage=$(mktemp -d 2>/dev/null) || stage=''
    for i in "${!real[@]}"; do
      f=${real[i]}
      if [ -n "$stage" ] && [ "$(stat -c %s "$f" 2>/dev/null || echo 0)" -le "$bl_copy_max" ] &&
        cp -- "$f" "$stage/$i.dat" 2>/dev/null; then
        scan+=("$stage/$i.dat")
      else
        scan+=("$f")
      fi
    done

    # One scan for the whole set; only a dirty set pays to find out which file.
    if ! bl_dir "${scan[@]}"; then
      for i in "${!scan[@]}"; do bl_dir "${scan[i]}" || offenders+=("${real[i]}"); done
    fi
    [ -n "$stage" ] && rm -rf "$stage"
  fi
  [ ${#offenders[@]} -eq 0 ] && return 0

  # stderr: Claude Code feeds this back to the model as the block reason.
  {
    echo "Blocked: this commit would add binary file(s) that hold a secret, or that could not be scanned:"
    printf '  - %s\n' "${offenders[@]}"
    echo
    echo "Fix one of:"
    echo "  * drop the file, or add it to .gitignore if it is build output (recommended), or"
    echo "  * list the path(s) in $root/.claude-allow-secrets (persistent, per-repo), or"
    echo "  * set CLAUDE_ALLOW_SECRETS to the path(s), colon-separated (one-off)"
    echo
    echo "Inspect with: betterleaks dir <path> --redact --verbose"
  } 1>&2

  deny "Blocked: this commit would add binary file(s) that hold a secret, or that could not be scanned. See the blocked-command output for the path(s); drop or gitignore them, or list them in .claude-allow-secrets / CLAUDE_ALLOW_SECRETS."
}

# --- Content scan helpers ---
# bl_scan <mode> -> sets bl_report to the findings JSON, empty when the scan is
# clean, errors, or times out. It sets a global rather than printing so the
# caller needs no command substitution, which would fork per scan.
# --exit-code 9 keeps "leaks found" distinct from betterleaks' error exit of 1,
# so a broken scan allows instead of blocking every commit.
# docs/implementation.md#exit-codes-and-fail-open
bl_scan() {
  local out rc
  out=$(timeout "$bl_cap" betterleaks git "$1" ${bl_cfg[@]+"${bl_cfg[@]}"} \
    --no-banner --redact --log-level error --exit-code 9 -f json -r - 2>/dev/null)
  rc=$?
  bl_report=""
  [ "$rc" -eq 9 ] && bl_report=$out
  [ "$rc" -eq 124 ] &&
    echo "Warning: betterleaks hit the ${bl_cap}s scan cap on 'git $1', so this commit was NOT scanned for secret values. Run 'betterleaks git $1 --redact' by hand before you trust it." 1>&2
  return 0
}

# stages_all <command> -> 0 for a `git commit -a`, which stages tracked edits
# after this hook has run. Truncates at the message flag so message text does
# not read as a flag. docs/implementation.md#git-commit--a
stages_all() {
  local flags=${1%%-m *}
  flags=${flags%%--message*}
  [[ $flags =~ (^|[[:space:]])(-[a-zA-Z]*a|--all([[:space:]]|$)) ]]
}

# --- Content scan ---
# Blocks on a secret value pasted into a file, and on the secret-filename rule
# matching a name alone. Fails open on every path except a real finding: missing
# tool, no repo, scanner error, or timeout all allow.
# docs/implementation.md#content-scan
scan_content() {
  [ "$has_bl" -eq 1 ] || allow
  command -v jq >/dev/null 2>&1 || allow

  local cmd mode where lines=() line f

  mode=--staged where="staged content"
  bl_scan "$mode"
  if [ -z "$bl_report" ]; then
    # Parsed only now, so a blocking scan never pays for a jq it will not use.
    # `// .command` is Cursor, which passes the command flat.
    cmd=$(jq -r '.tool_input.command // .command // empty' <<< "$payload" 2>/dev/null)
    if stages_all "$cmd"; then
      mode=--pre-commit where="working tree, which \`git commit -a\` stages for you"
      bl_scan "$mode"
    fi
  fi
  [ -z "$bl_report" ] && allow

  # Drop findings the allowlist already exempts, so one list covers every check.
  # One jq pass emits the filter key and the display line, tab-separated.
  while IFS=$'\t' read -r f line; do
    [ -n "$f" ] && ! is_allowed "$f" && lines+=("$line")
  done < <(jq -r \
    '.[] | "\(.File)\t  - \(.RuleID) in \(.File):\(.StartLine) (fingerprint: \(.Fingerprint))"' \
    <<< "$bl_report" 2>/dev/null)
  [ ${#lines[@]} -eq 0 ] && allow

  # stderr: Claude Code feeds this back to the model as the block reason.
  {
    echo "Blocked: betterleaks flagged the $where:"
    printf '%s\n' "${lines[@]}"
    echo
    echo "A 'secret-filename' rule means the file name alone marks it as a secret."
    echo "Any other rule means a secret value was found on that line."
    echo
    echo "Inspect with: betterleaks git $mode --redact --verbose"
    # Ordered portable first: the three betterleaks hatches work for anyone
    # scanning this repo, the local list only for a user running this hook. The
    # list is named last, not omitted, because a fingerprint keys one line in one
    # file, which cannot express a name rule repeated across directories.
    # docs/implementation.md#why-this-list-exists-at-all
    echo "Fix one of:"
    echo "  * remove the secret, or add the file to .gitignore (recommended), or"
    echo "  * mark a false positive with a 'betterleaks:allow' comment on the line, or"
    echo "  * add the fingerprint above to $root/.betterleaksignore, or"
    echo "  * last resort, and not portable to anyone without this hook: list the file in $root/.claude-allow-secrets"
  } 1>&2

  deny "Blocked: betterleaks flagged the content this commit would add. See the blocked-command output for the rule, file and line; a 'secret-filename' rule means the name itself is the problem, so gitignore the file. Otherwise remove the secret, mark the line betterleaks:allow, or add the printed fingerprint to .betterleaksignore. Only if no fingerprint fits, list the file in .claude-allow-secrets."
}

scan_binary  # blocks on a binary holding a secret, otherwise returns
scan_content # always allows or blocks
