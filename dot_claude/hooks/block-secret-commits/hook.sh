#!/usr/bin/env bash
# Blocks a `git commit` that would commit a secret. Two checks: a binary scan
# for files the scanner cannot read, and a betterleaks scan for secret values
# and secret file names.
#
# Reasoning, measurements and rejected alternatives: docs/implementation.md
# Behaviour and escape hatches: README.md
set -u

# Order is load-bearing twice: the stdin read precedes the jq that parses the
# payload, and the repo root precedes the allowlist and every git command.
# docs/implementation.md#execution-order

# --- Allow / deny helpers ---
# One exit path for two hosts: Cursor reads the JSON verdict, Claude Code reads
# the exit code. Pass deny a static string, never a filename.
# docs/implementation.md#host-contract
allow() { printf '{"permission":"allow"}\n'; exit 0; }
deny() { printf '{"permission":"deny","agent_message":"%s"}\n' "$1"; exit 2; }

# --- Trigger filter ---
# `git commit` only, matched in the raw payload. Both scans read the index, and
# at `git add` time the command has not written it yet. `commit` must be a whole
# word, and the two words are tested apart because flags sit between them.
# docs/implementation.md#trigger-filter
IFS= read -r -d '' payload
[[ $payload == *git* ]] || allow
[[ $payload =~ [[:space:]]commit([^[:alnum:]_-]|$) ]] || allow

# --- Repo root ---
# Both scans run against the current directory, so move there first. A failed cd
# means no such directory, which allows. docs/implementation.md#repo-root
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || allow

# --- Allowlist overrides ---
# Two additive sources feed one list: the .claude-allow-secrets file and the
# CLAUDE_ALLOW_SECRETS variable. is_allowed is the single definition of
# "allowed" for both scans. docs/implementation.md#allowlist-overrides
allowlist=()
if [ -f "$root/.claude-allow-secrets" ]; then
  while IFS= read -r line; do
    case $line in ''|'#'*) continue ;; esac # skip blank and comment lines
    allowlist+=("$line")
  done < "$root/.claude-allow-secrets"
fi
if [ -n "${CLAUDE_ALLOW_SECRETS:-}" ]; then
  IFS=$' \t\n:' read -ra env_entries <<< "$CLAUDE_ALLOW_SECRETS"
  allowlist+=("${env_entries[@]}")
fi

is_allowed() { # $1 = repo-relative path; allowed if path or basename is listed
  [ ${#allowlist[@]} -eq 0 ] && return 1 # set -u safe: don't expand empty array
  local e
  for e in "${allowlist[@]}"; do
    { [ "$e" = "$1" ] || [ "$e" = "${1##*/}" ]; } && return 0
  done
  return 1
}

# --- Binary scan ---
# betterleaks skips a binary blob in git mode, so a keystore reaches the commit
# unread. `--numstat` prints "-\t-" for a blob git cannot diff as text, which is
# the same NUL-byte test betterleaks uses to skip it, so this set is exactly
# what the content scan cannot read. Added files only; git and bash only, so it
# is the one check that never fails open. docs/implementation.md#binary-scan
scan_binary() {
  local rec f offenders=()
  while IFS= read -r -d '' rec; do
    case $rec in
      $'-\t-\t'*) f=${rec#$'-\t-\t'}; is_allowed "$f" || offenders+=("$f") ;;
    esac
  done < <(git diff --cached --numstat -z --diff-filter=A 2>/dev/null)
  [ ${#offenders[@]} -eq 0 ] && return 0

  # stderr: Claude Code feeds this back to the model as the block reason.
  {
    echo "Blocked: this commit would add binary file(s), which the secret scanner cannot read:"
    printf '  - %s\n' "${offenders[@]}"
    echo
    echo "A binary file is never scanned for secrets, so a keystore, a key bundle or a"
    echo "database dump would reach the commit unchecked. Fix one of:"
    echo "  * drop the file, or add it to .gitignore if it is build output (recommended), or"
    echo "  * list the path(s) in $root/.claude-allow-secrets (persistent, per-repo), or"
    echo "  * set CLAUDE_ALLOW_SECRETS to the path(s), colon-separated (one-off)"
    echo
    echo "Check one by hand with: betterleaks dir <path> --redact --verbose"
  } 1>&2

  deny "Blocked: this commit would add binary file(s) that the secret scanner cannot read. See the blocked-command output for the path(s); drop or gitignore them, or list them in .claude-allow-secrets / CLAUDE_ALLOW_SECRETS."
}

# --- betterleaks config ---
# conf/betterleaks.toml holds the file-name rules. It sits next to this script
# because betterleaks has no XDG lookup, and is passed only when the repo
# defines no config of its own, so a repo's own config still wins.
# docs/implementation.md#config-resolution
bl_cfg=()
if [ -z "${BETTERLEAKS_CONFIG:-}${GITLEAKS_CONFIG:-}${BETTERLEAKS_CONFIG_TOML:-}${GITLEAKS_CONFIG_TOML:-}" ] &&
   [ ! -f "$root/.betterleaks.toml" ] && [ ! -f "$root/.gitleaks.toml" ]; then
  cfg="${BASH_SOURCE[0]%/*}/conf/betterleaks.toml"
  [ -f "$cfg" ] && bl_cfg=(--config "$cfg")
fi

# --- Content scan helpers ---
# bl_scan <mode> -> sets bl_report to the findings JSON, or empty when the scan
# is clean, errors, or times out. Sets a global rather than printing, so it is
# never called in a $( ) subshell. --exit-code 9 keeps "leaks found" distinct
# from betterleaks' error exit of 1, so a broken scan allows instead of blocking
# every commit.
#
# The timeout wrapper is load-bearing. Do NOT replace it with betterleaks'
# own --timeout, which aborts the scan and exits 0, turning a truncated scan
# into a silent pass. docs/implementation.md#scan-cap
bl_cap=4
bl_scan() {
  local out rc
  out=$(timeout "$bl_cap" "$bl" git "$1" ${bl_cfg[@]+"${bl_cfg[@]}"} \
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
  bl=$(command -v betterleaks) || allow
  command -v jq >/dev/null 2>&1 || allow

  local cmd mode where lines=() line f

  mode=--staged
  bl_scan "$mode"
  if [ -z "$bl_report" ]; then
    # Parsed only now, so a blocking scan never pays for a jq it will not use.
    # `// .command` is Cursor, which passes the command flat.
    cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // .command // empty' 2>/dev/null)
    if stages_all "$cmd"; then
      mode=--pre-commit
      bl_scan "$mode"
    fi
  fi
  [ -z "$bl_report" ] && allow

  # Drop findings the allowlist already exempts, so one list covers every check.
  # One jq pass emits the filter key and the display line, tab-separated.
  while IFS=$'\t' read -r f line; do
    [ -n "$f" ] && ! is_allowed "$f" && lines+=("$line")
  done < <(printf '%s' "$bl_report" | jq -r \
    '.[] | "\(.File)\t  - \(.RuleID) in \(.File):\(.StartLine) (fingerprint: \(.Fingerprint))"' 2>/dev/null)
  [ ${#lines[@]} -eq 0 ] && allow

  where="staged content"
  [ "$mode" = --pre-commit ] && where="working tree, which \`git commit -a\` stages for you"

  # stderr: Claude Code feeds this back to the model as the block reason.
  {
    echo "Blocked: betterleaks flagged the $where:"
    printf '%s\n' "${lines[@]}"
    echo
    echo "A 'secret-filename' rule means the file name alone marks it as a secret."
    echo "Any other rule means a secret value was found on that line."
    echo
    echo "Inspect with: betterleaks git $mode --redact --verbose"
    echo "Fix one of:"
    echo "  * remove the secret, or add the file to .gitignore (recommended), or"
    echo "  * mark a false positive with a 'betterleaks:allow' comment on the line, or"
    echo "  * add the fingerprint to $root/.betterleaksignore, or"
    echo "  * list the file in $root/.claude-allow-secrets (exempts it from every check)"
  } 1>&2

  deny "Blocked: betterleaks flagged the content this commit would add. See the blocked-command output for the rule, file and line; a 'secret-filename' rule means the name itself is the problem, so gitignore the file or list it in .claude-allow-secrets. Otherwise remove the secret, mark the line betterleaks:allow, or add the fingerprint to .betterleaksignore."
}

scan_binary  # blocks on an unreadable binary, otherwise returns
scan_content # always allows or blocks
