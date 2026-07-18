#!/usr/bin/env bash
set -u

# --- Allow helper ---
# Cursor's beforeShellExecution hook requires valid JSON on stdout (empty stdout
# is rejected as "not valid JSON" and blocks the command). Claude Code ignores
# the unknown "permission" field and proceeds on exit 0, so this satisfies both.
allow() { printf '{"permission":"allow"}\n'; exit 0; }

# --- Trigger filter (git add / git commit only) ---
# Look for the command text inside the raw JSON payload. Matching too widely is
# harmless: a wrong match just runs the scan below, which only ever blocks on a
# real secret file. We look for the exact phrase "git add" because "add" by
# itself turns up in too many unrelated paths and words.
IFS= read -r -d '' payload
case $payload in
  *"git add"*|*git*commit*) ;;
  *) allow ;;
esac

# --- Repo root (fall back to cwd if Claude did not set the project dir) ---
root="${CLAUDE_PROJECT_DIR:-$PWD}"

# --- Overrides (see README) ---
# The override names the specific secret file(s) that may be committed, by
# repo-relative path or by bare basename, so it no longer waves through every
# secret at once. Two sources, both additive:
#   * .claude-allow-secrets file: one entry per line (# comments / blanks ok)
#   * CLAUDE_ALLOW_SECRETS env var: whitespace- or colon-separated, one-off skips
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

# --- Danger classifier (allowlist checked first so templates pass) ---
is_dangerous() {
  case "$1" in
    # allowlist: templates are safe to commit
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

# --- Scan committable files (non-repo → ls-files errors → empty → allow) ---
cd "$root" 2>/dev/null || allow # run from repo root so git sees this repo's files

# git ls-files flags: --cached=tracked, --others=untracked,
# --exclude-standard=drop gitignored, -z=NUL-separate names (spaces/newlines safe)
offenders=()
while IFS= read -r -d '' path; do # read one NUL-terminated filename per iteration
  is_dangerous "${path##*/}" && ! is_allowed "$path" && offenders+=("$path") # basename builtin, no fork; skip allowlisted
done < <(git ls-files -z --cached --others --exclude-standard 2>/dev/null) # < <() not a pipe, so offenders survives the loop

# nothing dangerous found → allow the command
[ ${#offenders[@]} -eq 0 ] && allow

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

# stdout: Cursor's beforeShellExecution deny + message (it also honors exit 2).
list=$(printf '%s, ' "${offenders[@]}"); list=${list%, }
printf '{"permission":"deny","agent_message":"Blocked: git command would stage/commit untracked secret file(s): %s. Gitignore them, or list the path(s) in .claude-allow-secrets, or set CLAUDE_ALLOW_SECRETS to the path(s)."}\n' "$list"
exit 2
