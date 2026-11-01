#!/usr/bin/env bash
# Set the templates/web/mise.toml pins to the host versions: dcg from the mise
# config in the chezmoi source, which mise-bump bumps each month, and chezmoi
# from `chezmoi --version`. Then lock and run check.sh. Review, commit, and
# push the change yourself. Needs docker.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WEB="$REPO/templates/web"
DCG_KEY="github:Dicklesworthstone/destructive_command_guard"

# --- Host versions ---
host_config="$(chezmoi source-path)/dot_config/mise/config.toml"
dcg="$(yq -p toml -oy ".tools[\"$DCG_KEY\"].version" "$host_config")"
chezmoi="$(chezmoi --version | sed -n 's/^chezmoi version v\([^,]*\),.*/\1/p')"
for pair in "dcg=$dcg" "chezmoi=$chezmoi"; do
  [[ "${pair#*=}" =~ ^[0-9]+(\.[0-9]+)*$ ]] || {
    echo "cloud-tools-bump: no host version for ${pair%%=*}: '${pair#*=}'" >&2
    exit 1
  }
done

# --- Compare ---
old_dcg="$(yq -p toml -oy ".tools[\"$DCG_KEY\"]" "$WEB/mise.toml")"
old_chezmoi="$(yq -p toml -oy '.tools.chezmoi' "$WEB/mise.toml")"
if [[ "$old_dcg" == "$dcg" && "$old_chezmoi" == "$chezmoi" ]]; then
  echo "cloud-tools-bump: the cloud pins match the host (dcg $dcg, chezmoi $chezmoi)"
  exit 0
fi

# --- Write ---
# sed keeps the comments that a TOML rewrite would drop. Its patterns match the
# current line format only, so stop if one did not match.
sed -i '' -e "s|^chezmoi = \".*\"$|chezmoi = \"$chezmoi\"|" \
  -e "s|^\"$DCG_KEY\" = \".*\"$|\"$DCG_KEY\" = \"$dcg\"|" "$WEB/mise.toml"
if [[ "$(yq -p toml -oy ".tools[\"$DCG_KEY\"]" "$WEB/mise.toml")" != "$dcg" ||
"$(yq -p toml -oy '.tools.chezmoi' "$WEB/mise.toml")" != "$chezmoi" ]]; then
  echo "cloud-tools-bump: could not write the pins in $WEB/mise.toml" >&2
  exit 1
fi
echo "cloud-tools-bump: dcg $old_dcg -> $dcg, chezmoi $old_chezmoi -> $chezmoi"

# --- Lock and check ---
(cd "$WEB" && mise lock --platform linux-x64,linux-arm64)
"$HERE/check.sh"
echo "cloud-tools-bump: check passed. Review, commit, and push:"
git -C "$REPO" status --short -- "$WEB"
