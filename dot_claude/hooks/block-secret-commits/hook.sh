#!/usr/bin/env bash
set -u

# --- Trigger filter (git commit only) ---
# loose substring match on the raw payload; only over-triggers into a harmless
# scan, never a false block (blocking is gated by real files below).
IFS= read -r -d '' payload
[[ $payload == *git* && $payload == *commit* ]] || exit 0

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

[ ${#offenders[@]} -eq 0 ] && exit 0

# --- Block and report ---
{
  echo "Blocked: git commit would include secret file(s) that are not gitignored:"
  printf '  - %s\n' "${offenders[@]}"
  echo
  echo "Fix one of:"
  echo "  * add the file(s) to .gitignore (recommended), or"
  echo "  * touch $root/.claude-allow  (persistent, per-repo override), or"
  echo "  * set CLAUDE_ALLOW_ENV_COMMIT=1  (one-off override)"
} 1>&2
exit 2
