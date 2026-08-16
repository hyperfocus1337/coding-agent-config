#!/usr/bin/env bash
set -u

# Sections:
#   1. Danger classifier
#   2. Sourcing guard
#   3. Allow / deny helpers
#   4. Trigger filter
#   5. Repo root
#   6. Allowlist overrides
#   7. Content scan helpers
#   8. Content scan
#   9. Filename scan
#  10. Block and report
#
# The order is load-bearing throughout: the classifier has to precede the
# sourcing guard, the guard has to precede the stdin read, and the repo root has
# to precede the allowlist that reads a file under it.

# --- Danger classifier ---
# is_dangerous <basename> -> exit 0 if the name looks like a real secret that
# must never be committed, 1 otherwise (templates and everything else). Match
# on basename, not full path.
is_dangerous() {
  case "$1" in
    # allowlist: templates carry placeholders, not real secrets
    .env.example|.env.sample|.env.template|.env.dist) return 1 ;;
    # env files
    .env|.env.*|.envrc) return 0 ;;
    # private keys (ssh + generic)
    id_rsa|id_dsa|id_ecdsa|id_ed25519) return 0 ;;
    *.pem|*.key|*.p8|*.pkcs8|*.ppk) return 0 ;;
    # keystores / pkcs bundles
    *.pfx|*.p12|*.pkcs12|*.keystore|*.jks) return 0 ;;
    # credential / auth files
    .netrc|.pgpass|.htpasswd|.git-credentials|.dockercfg) return 0 ;;
    credentials.json|*.ovpn|*.kubeconfig) return 0 ;;
  esac
  return 1
}

# --- Sourcing guard ---
# Sourced (e.g. by test.sh)? Only the classifier above is wanted; stop before
# the hook body reads stdin. Defined first so sourcing never blocks on `read`.
[[ "${BASH_SOURCE[0]}" == "${0}" ]] || return 0

# --- Allow / deny helpers ---
# Cursor's beforeShellExecution hook requires valid JSON on stdout (empty stdout
# is rejected as "not valid JSON" and blocks the command). Claude Code ignores
# the unknown "permission" field and proceeds on exit 0, so this satisfies both.
allow() { printf '{"permission":"allow"}\n'; exit 0; }

# deny <message> -> Cursor's deny verdict plus exit 2, which Claude Code honors
# as a block. Pass a static string: a filename with a " or a newline would
# malform the JSON, and Cursor fails open on bad JSON. The exact paths go to
# stderr instead, which Claude Code feeds back to the model as the block reason.
deny() { printf '{"permission":"deny","agent_message":"%s"}\n' "$1"; exit 2; }

# --- Trigger filter ---
# git add / git commit only. Look for the command text inside the raw JSON
# payload. Matching too widely is harmless: a wrong match just runs the scans
# below, which only ever block on a real secret. We look for the exact phrase
# "git add" because "add" by itself turns up in too many unrelated paths and
# words. is_commit carries the commit test to the content scan, so the pattern
# is written once.
#
# "commit" has to be a word of its own. A plain *git*commit* glob also matched
# the literal path hooks/block-secret-commits/, so `git add` on any path holding
# that word ran the commit-only content scan, against an index the command had
# not written yet. Requiring whitespace in front rejects -commits and /commit
# alike, and rejecting a trailing word character rejects commit-msg. The two
# words are tested apart because flags sit between them in `git -C /tmp commit`.
IFS= read -r -d '' payload
is_commit=0
if [[ $payload == *git* ]] && [[ $payload =~ [[:space:]]commit([^[:alnum:]_-]|$) ]]; then
  is_commit=1
elif [[ $payload != *"git add"* ]]; then
  allow
fi

# --- Repo root ---
# Fall back to cwd if Claude did not set the project dir.
root="${CLAUDE_PROJECT_DIR:-$PWD}"

# --- Allowlist overrides ---
# See README. The override names the specific secret file(s) that may be
# committed, by repo-relative path or by bare basename, so it no longer waves
# through every secret at once. Two sources, both additive:
#   * .claude-allow-secrets file: one entry per line (# comments / blanks ok)
#   * CLAUDE_ALLOW_SECRETS env var: whitespace- or colon-separated, one-off skips
# Both feed is_allowed, which is the single definition of "allowed" for the
# filename scan and the content scan alike.
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

# --- Content scan helpers ---
# bl_scan <mode> -> sets bl_report to the JSON findings array, or to empty when
# the scan is clean, errors, or times out. Not called in a $( ) substitution, so
# the global it sets survives.
#
# --exit-code 9 separates "leaks found" from betterleaks' own error exit (1), so
# a broken scan allows the commit instead of blocking every commit.
# --redact keeps the secret value out of the report, the logs, and this output.
#
# timeout bounds the run. A large high-entropy staged blob (base64, minified
# bundle) otherwise scans for tens of seconds: ~26MB takes 7s and ~104MB takes
# 41s, well past the hook timeout in settings.json. A hook killed by that
# timeout exits 124, which reaches Claude as an error and not as a block, so the
# scan has to cap itself instead. Ordinary source is nowhere near this: 20MB of
# code scans in 2s. A capped scan is the one fail-open path a reader cannot
# infer from a clean run, so it warns here; Claude Code shows hook stderr in the
# transcript. $bl is the resolved binary path, so timeout skips its PATH walk.
bl_cap=4
bl_scan() {
  local out rc
  out=$(timeout "$bl_cap" "$bl" git "$1" --no-banner --redact --log-level error \
    --exit-code 9 -f json -r - 2>/dev/null)
  rc=$?
  bl_report=""
  [ "$rc" -eq 9 ] && bl_report=$out
  [ "$rc" -eq 124 ] &&
    echo "Warning: betterleaks hit the ${bl_cap}s scan cap on 'git $1', so this commit was NOT scanned for secret values. Run 'betterleaks git $1 --redact' by hand before you trust it." 1>&2
  return 0
}

# stages_all <command> -> 0 when this is a `git commit -a`, which stages tracked
# edits as part of the commit, after this hook has already run. Truncate at the
# message flag first, so `git commit -m "add -a flag"` does not count as -a. A
# message glued to the flag (-m"...") defeats that and costs one extra scan.
# --all is anchored on both ends so --allow-empty does not read as --all.
stages_all() {
  local flags=${1%%-m *}
  flags=${flags%%--message*}
  [[ $flags =~ (^|[[:space:]])(-[a-zA-Z]*a|--all([[:space:]]|$)) ]]
}

# --- Content scan ---
# The filename rules cannot see a secret pasted into an ordinary file, so hand
# the committable content to betterleaks. Never returns: it allows or blocks.
#
# Commit only. At `git add` time the index does not hold the new files yet, so a
# staged scan would find nothing. By commit time it does, because the git slash
# commands stage and commit in the same response.
#
# Fails open on every path except a real finding: a missing binary, no git repo,
# a scanner error, or a timeout all allow, and the filename guard still applies.
# jq is a hard requirement rather than a partial degradation, because the
# allowlist filter below runs on the report: without jq a file listed in
# .claude-allow-secrets would still block, contradicting the escape hatch the
# block message names.
scan_content() {
  [ "$is_commit" -eq 1 ] || allow
  bl=$(command -v betterleaks) || allow
  command -v jq >/dev/null 2>&1 || allow

  local cmd mode where lines=() line f

  mode=--staged
  bl_scan --staged
  if [ -z "$bl_report" ]; then
    # `// .command` is Cursor, which passes the command flat rather than under
    # tool_input. Same extraction as enforce-cli-tools/hook.sh. Read here, not
    # earlier, so a blocking scan never pays for a jq it will not use.
    cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // .command // empty' 2>/dev/null)
    if stages_all "$cmd"; then
      mode=--pre-commit
      bl_scan --pre-commit
    fi
  fi
  [ -z "$bl_report" ] && allow

  # Drop findings in a file the allowlist already exempts, so
  # .claude-allow-secrets and CLAUDE_ALLOW_SECRETS cover both checks with one
  # list. Reuses is_allowed, so "allowed" has exactly one definition. One jq
  # pass emits the filter key and the display line together, tab-separated.
  while IFS=$'\t' read -r f line; do
    [ -n "$f" ] && ! is_allowed "$f" && lines+=("$line")
  done < <(printf '%s' "$bl_report" | jq -r \
    '.[] | "\(.File)\t  - \(.RuleID) in \(.File):\(.StartLine) (fingerprint: \(.Fingerprint))"' 2>/dev/null)
  [ ${#lines[@]} -eq 0 ] && allow

  where="staged content"
  [ "$mode" = --pre-commit ] && where="working tree, which \`git commit -a\` stages for you"

  # stderr: Claude Code feeds this back to the model as the block reason.
  {
    echo "Blocked: betterleaks found secret(s) in the $where:"
    printf '%s\n' "${lines[@]}"
    echo
    echo "Inspect with: betterleaks git $mode --redact --verbose"
    echo "Fix one of:"
    echo "  * remove the secret from the content (recommended), or"
    echo "  * mark a false positive with a 'betterleaks:allow' comment on the line, or"
    echo "  * add the fingerprint to $root/.betterleaksignore, or"
    echo "  * list the file in $root/.claude-allow-secrets (exempts it from both checks)"
  } 1>&2

  deny "Blocked: betterleaks found secret(s) in the content this commit would add. See the blocked-command output for the rule, file and line; remove the secret, mark the line betterleaks:allow, add the fingerprint to .betterleaksignore, or list the file in .claude-allow-secrets."
}

# --- Filename scan ---
# Scan committable files (non-repo → ls-files errors → empty → allow).
cd "$root" 2>/dev/null || allow # run from repo root so git sees this repo's files

# git ls-files flags: --cached=tracked, --others=untracked,
# --exclude-standard=drop gitignored, -z=NUL-separate names (spaces/newlines safe)
offenders=()
while IFS= read -r -d '' path; do # read one NUL-terminated filename per iteration
  is_dangerous "${path##*/}" && ! is_allowed "$path" && offenders+=("$path") # basename builtin, no fork; skip allowlisted
done < <(git ls-files -z --cached --others --exclude-standard 2>/dev/null) # < <() not a pipe, so offenders survives the loop

# no dangerous filename → hand off to the content scan, which allows or blocks
[ ${#offenders[@]} -eq 0 ] && scan_content

# --- Block and report ---
# stderr: Claude Code feeds this back to the model as the block reason (exit 2).
{
  echo "Blocked: this git command would stage or commit secret file(s) that are not gitignored:"
  printf '  - %s\n' "${offenders[@]}"
  echo
  echo "Fix one of:"
  echo "  * add the file(s) to .gitignore (recommended), or"
  echo "  * list the path(s) in $root/.claude-allow-secrets (persistent, per-repo), or"
  echo "  * set CLAUDE_ALLOW_SECRETS to the path(s), colon-separated (one-off)"
} 1>&2

deny "Blocked: git command would stage/commit an untracked secret file. See the blocked-command output for the path(s); gitignore them or add them to .claude-allow-secrets / CLAUDE_ALLOW_SECRETS."
