#!/usr/bin/env bash
# Test for the two name-based checks in hook.sh: the secret-filename rule in
# betterleaks.toml, and the binary scan.
#
# Run: bash test.sh
# Builds throwaway repos, pipes a hook payload into hook.sh, asserts the exit
# code: 0 = allowed, 2 = blocked. The binary scan is git and bash only, so it
# runs unconditionally. The name rule needs betterleaks and jq, so those cases
# skip when either is missing (the hook fails open, matching the skip).
set -u
HOOK="$(cd "$(dirname "$0")/.." && pwd)/hook.sh"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

# The hook resolves conf/betterleaks.toml relative to its own path, so running
# ../hook.sh from this working tree tests this tree's rules. No shim, and no
# dependency on whichever version chezmoi last deployed.
CFG="$(dirname "$HOOK")/conf/betterleaks.toml"
[ -f "$CFG" ] || { echo "FAIL cannot find $CFG"; exit 1; }

mkrepo() { # mkrepo <name> -> path to a repo with one seed commit
  local r="$tmp/$1"
  mkdir -p "$r"
  git -C "$r" init -q .
  git -C "$r" config user.email test@example.com
  git -C "$r" config user.name test
  echo seed > "$r/seed.txt"
  git -C "$r" add -A
  git -C "$r" commit -qm seed
  echo "$r"
}

hook() { # hook <repo> <command-text> -> run the hook against that repo
  CLAUDE_PROJECT_DIR="$1" bash "$HOOK" \
    <<< "$(printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$2")"
}

run() { # run <repo> <command-text> -> hook exit code
  hook "$@" >/dev/null 2>&1
  echo $?
}

msg() { # msg <repo> <command-text> -> the block reason the hook writes to stderr
  { hook "$@" >/dev/null; } 2>&1 # drop stdout (the Cursor JSON), keep stderr
}

assert() { # assert <expected-code> <actual-code> <label>
  if [ "$1" = "$2" ]; then echo "ok   $3"; else echo "FAIL $3 (want $1, got $2)"; fail=1; fi
}

names() { # every file name the secret-filename rule must block
  cat <<'EOF'
.env
.env.local
.envrc
.netrc
.pgpass
.htpasswd
.git-credentials
.dockercfg
.s3cfg
.gitrobrc
.bash_history
.zsh_history
credentials.json
id_rsa
id_dsa
id_ecdsa
id_ed25519
server.pem
private.key
deploy.keypair
key.p8
key.pkcs8
putty.ppk
cert.pfx
bundle.p12
bundle.pkcs12
store.keystore
my.keyring
app.jks
vault.kdb
login.keychain
vpn.ovpn
cluster.kubeconfig
conn.tblk/config.ovpn
pw.agilekeychain/data.json
EOF
}

# --- Binary scan: no betterleaks needed ---
# A NUL byte is what makes git report the blob as binary, which is the same test
# betterleaks uses to skip it. That equivalence is the whole basis of the check.
r=$(mkrepo binary)
printf 'PK\003\004\000\000bundle\000payload\n' > "$r/keys.p12"
git -C "$r" add -A
assert 2 "$(run "$r" 'git commit -m x')" "binary file blocked"

case "$(msg "$r" 'git commit -m x')" in
  *"keys.p12"*) echo "ok   binary block message names the file" ;;
  *) echo "FAIL binary block message names the file"; fail=1 ;;
esac

# A name with a space and a quote must survive the -z parsing intact.
r=$(mkrepo binaryodd)
printf 'PK\003\004\000\000x\000y\n' > "$r/we ird\".p12"
git -C "$r" add -A
assert 2 "$(run "$r" 'git commit -m x')" "binary file with space and quote blocked"

# A text file is diffable, so betterleaks reads it and the binary scan ignores it.
r=$(mkrepo textonly)
echo 'plain text, nothing secret' > "$r/notes.txt"
git -C "$r" add -A
assert 0 "$(run "$r" 'git commit -m x')" "ordinary text file allowed"

# A modified tracked binary is out of scope: --diff-filter=A covers added only.
r=$(mkrepo binarymod)
printf 'PK\003\004\000\000v1\000\n' > "$r/logo.bin"
git -C "$r" add -A
git -C "$r" commit -qm addbin
printf 'PK\003\004\000\000v2\000changed\n' > "$r/logo.bin"
git -C "$r" add -A
assert 0 "$(run "$r" 'git commit -m x')" "modified tracked binary allowed"

# The allowlist has to exempt a binary too, not just a secret name.
r=$(mkrepo binaryallow)
printf 'PK\003\004\000\000x\000y\n' > "$r/keys.p12"
echo 'keys.p12' > "$r/.claude-allow-secrets"
git -C "$r" add -A
assert 0 "$(run "$r" 'git commit -m x')" "binary exempted by .claude-allow-secrets"

r=$(mkrepo binaryenv)
printf 'PK\003\004\000\000x\000y\n' > "$r/keys.p12"
git -C "$r" add -A
assert 0 "$(CLAUDE_ALLOW_SECRETS=keys.p12 run "$r" 'git commit -m x')" \
  "binary exempted by CLAUDE_ALLOW_SECRETS"

# --- Name rule: needs betterleaks and jq ---
if ! command -v betterleaks >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "skip: betterleaks or jq missing, so the name rule fails open"
  [ "$fail" -eq 0 ] && { echo "all pass"; exit 0; }
  echo "FAILURES"; exit 1
fi

# Every dangerous name, staged together as text, must be named in one block.
# Text content keeps the binary scan out of the way, so a hit proves the rule.
r=$(mkrepo names)
while IFS= read -r n; do
  case "$n" in */*) mkdir -p "$r/${n%/*}" ;; esac # bundle names only
  echo 'placeholder' > "$r/$n"
done < <(names)
git -C "$r" add -A
assert 2 "$(run "$r" 'git commit -m x')" "secret file names blocked"

out=$(msg "$r" 'git commit -m x')
missed=""
while IFS= read -r n; do
  case "$out" in *"$n"*) ;; *) missed="$missed $n" ;; esac
done < <(names)
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

# The allowlist exempts a secret name by bare basename and by path.
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

if [ "$fail" -eq 0 ]; then echo "all pass"; else echo "FAILURES"; exit 1; fi
