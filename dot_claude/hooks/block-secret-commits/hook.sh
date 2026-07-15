#!/usr/bin/env bash
set -u

# --- Trigger filter (git add / git commit only) ---
# Look for the command text inside the raw JSON payload. Matching too widely is
# harmless: a wrong match just runs the scan below, which only ever blocks on a
# real secret file. We look for the exact phrase "git add" because "add" by
# itself turns up in too many unrelated paths and words.
IFS= read -r -d '' payload
case $payload in
  *"git add"*|*git*commit*) ;;
  *) exit 0 ;;
esac

# --- Repo root (fall back to cwd if Claude did not set the project dir) ---
root="${CLAUDE_PROJECT_DIR:-$PWD}"

# --- Overrides ---
[ -f "$root/.claude-allow" ] && exit 0
[ -n "${CLAUDE_ALLOW_ENV_COMMIT:-}" ] && exit 0

# --- Danger classifier (allowlist checked first so templates pass) ---
is_dangerous() {
  case "$1" in
    .env.example|.env.sample|.env.template|.env.dist) return 1 ;;
    .env|.env.*|.envrc)                                 return 0 ;;
    id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials.json) return 0 ;;
    *.pem|*.key|*.pfx|*.p12|*.pkcs12|*.keystore|*.jks)  return 0 ;;
  esac
  return 1
}

# --- Scan committable files (non-repo → ls-files errors → empty → allow) ---
cd "$root" 2>/dev/null || exit 0
offenders=()
while IFS= read -r -d '' f; do
  is_dangerous "${f##*/}" && offenders+=("$f")
done < <(git ls-files -z --cached --others --exclude-standard 2>/dev/null)

# nothing dangerous found → allow the command
[ ${#offenders[@]} -eq 0 ] && exit 0

# --- Block and report ---
{
  echo "Blocked: this git command would stage or commit secret file(s) that are not gitignored:"
  printf '  - %s\n' "${offenders[@]}"
  echo
  echo "Fix one of:"
  echo "  * add the file(s) to .gitignore (recommended), or"
  echo "  * touch $root/.claude-allow  (persistent, per-repo override), or"
  echo "  * set CLAUDE_ALLOW_ENV_COMMIT=1  (one-off override)"
} 1>&2
exit 2
