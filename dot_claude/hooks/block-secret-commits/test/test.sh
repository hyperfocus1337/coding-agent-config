#!/usr/bin/env bash
# Test for the two name-based checks in hook.sh: the binary scan, and the
# `secret-filename` rule in ../conf/betterleaks.toml.
#
# Run: bash test.sh
# Builds throwaway repos, pipes a hook payload into hook.sh, asserts the exit
# code: 0 = allowed, 2 = blocked. The binary scan delegates its verdict to
# betterleaks, so these cases need it; without it the scan blocks every added
# binary, which is asserted separately.
# shellcheck source=helpers.sh
# shellcheck disable=SC1091  # the source path is built at runtime
# shellcheck disable=SC2154  # rc and out are set by runmsg in helpers.sh
# shellcheck disable=SC2034  # fail is read by summary in helpers.sh
set -u
source "$(dirname "${BASH_SOURCE[0]}")/helpers.sh"

CFG="$(dirname "$HOOK")/conf/betterleaks.toml"
[ -f "$CFG" ] || { echo "FAIL cannot find $CFG"; exit 1; }

have_bl=0
command -v betterleaks >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 && have_bl=1

# A NUL byte is what makes git report a blob as binary, which is the same test
# betterleaks uses to skip it in git mode. Every binary fixture below carries
# one, so the equivalence the scan rests on is exercised rather than assumed.
# The token is a random string shaped like a GitHub PAT. It matches no live
# account. betterleaks:allow keeps this file from blocking its own commit.
secret_bin() { # a binary that genuinely holds a secret, under an innocuous name
  printf 'BIN\000\000token = "ghp_9f3Kd82jSlqQm4Zx7VbNc1Rt6Yu0Ii5Oo3Pp"\000\000\n' # betterleaks:allow
}
plain_bin() { printf 'PK\003\004\000\000plain\000payload\n'; } # binary, no secret

names=(
  .env .env.local .envrc .netrc .pgpass .htpasswd .git-credentials .dockercfg
  .s3cfg .gitrobrc .bash_history .zsh_history credentials.json
  id_rsa id_dsa id_ecdsa id_ed25519 server.pem private.key deploy.keypair
  key.p8 key.pkcs8 putty.ppk cert.pfx bundle.p12 bundle.pkcs12
  store.keystore my.keyring app.jks vault.kdb login.keychain
  vpn.ovpn cluster.kubeconfig conn.tblk/config.ovpn pw.agilekeychain/data.json
)

# --- Binary scan ---
# The scan must judge on secrets, not on undiffability. An ordinary image or
# archive has to commit freely; only a binary holding a secret blocks.
if [ "$have_bl" -eq 1 ]; then
  r=$(mkrepo binplain)
  plain_bin > "$r/archive.dat"
  printf 'GIF89a\000\000\001\000\001\000\200' > "$r/pic.gif"
  git -C "$r" add -A
  assert 0 "$(run "$r" 'git commit -m x')" "ordinary binary and image allowed"

  # An innocuous name with a private key inside: neither the old file-name list
  # nor the secret-filename rule would catch this one, only the content scan.
  r=$(mkrepo binsecret)
  secret_bin > "$r/payload.dat"
  git -C "$r" add -A
  runmsg "$r" 'git commit -m x'
  assert 2 "$rc" "binary holding a private key blocked"
  contains "payload.dat" "$out" "binary block message names the file"

  # A name with a space and a quote must survive the -z parsing intact.
  r=$(mkrepo binodd)
  secret_bin > "$r/we ird\".dat"
  git -C "$r" add -A
  assert 2 "$(run "$r" 'git commit -m x')" "binary with space and quote blocked"

  # --diff-filter=A covers added files only.
  r=$(mkrepo binmod)
  plain_bin > "$r/logo.dat"
  git -C "$r" add -A && git -C "$r" commit -qm addbin
  secret_bin > "$r/logo.dat" # a secret swapped into a tracked binary
  git -C "$r" add -A
  assert 0 "$(run "$r" 'git commit -m x')" "modified tracked binary allowed"

  # The allowlist has to exempt a binary too, not just a secret name.
  r=$(mkrepo binallow)
  secret_bin > "$r/payload.dat"
  echo 'payload.dat' > "$r/.claude-allow-secrets"
  git -C "$r" add -A
  assert 0 "$(run "$r" 'git commit -m x')" "binary exempted by .claude-allow-secrets"

  r=$(mkrepo binenv)
  secret_bin > "$r/payload.dat"
  git -C "$r" add -A
  assert 0 "$(CLAUDE_ALLOW_SECRETS=payload.dat run "$r" 'git commit -m x')" \
    "binary exempted by CLAUDE_ALLOW_SECRETS"
fi

# Without betterleaks the scan cannot judge, so it blocks every added binary.
# This is the one check that never fails open, and it must hold with no tools.
r=$(mkrepo binnobl)
plain_bin > "$r/archive.dat"
git -C "$r" add -A
assert 2 "$(PATH=/usr/bin:/bin run "$r" 'git commit -m x')" \
  "binary blocked when betterleaks is unavailable"

# --- Name rule ---
if [ "$have_bl" -eq 0 ]; then
  echo "skip: betterleaks or jq missing, so the name rule fails open"
  summary
fi

# Every dangerous name, staged together as text, must be named in one block.
r=$(mkrepo names)
for n in "${names[@]}"; do
  case "$n" in */*) mkdir -p "$r/${n%/*}" ;; esac # bundle names only
  echo 'placeholder' > "$r/$n"
done
git -C "$r" add -A
runmsg "$r" 'git commit -m x'
assert 2 "$rc" "secret file names blocked"
missed=""
for n in "${names[@]}"; do
  case "$out" in *"$n"*) ;; *) missed="$missed $n" ;; esac
done
if [ -z "$missed" ]; then echo "ok   every secret name appears in the block message"
else echo "FAIL names missing from block message:$missed"; fail=1; fi

# Templates and ordinary files must not trip the rule.
r=$(mkrepo allowed)
for n in .env.example .env.sample .env.template .env.dist \
         main.go README.md config.yaml id_rsa.pub server.crt notes.gpg; do
  echo 'placeholder' > "$r/$n"
done
git -C "$r" add -A
assert 0 "$(run "$r" 'git commit -m x')" "templates and ordinary files allowed"

# The allowlist exempts a secret name.
r=$(mkrepo nameallow)
echo 'placeholder' > "$r/.env"
echo '.env' > "$r/.claude-allow-secrets"
git -C "$r" add -A
assert 0 "$(run "$r" 'git commit -m x')" ".env exempted by .claude-allow-secrets"

# A repo carrying its own config keeps it, so the name rule stops applying.
r=$(mkrepo ownconfig)
printf '[extend]\nuseDefault = true\n' > "$r/.betterleaks.toml"
echo 'placeholder' > "$r/.env"
git -C "$r" add -A
assert 0 "$(run "$r" 'git commit -m x')" "repo .betterleaks.toml wins over the shipped config"

summary
