#!/usr/bin/env bash
# Publish each skill in dot_claude/skills/ as a versioned GitHub Release asset.
# A skill is only re-published when its content hash changes; the patch version
# then auto-increments. skills.lock.json (next to this script) is the source of
# truth for each skill's current version + hash, so we never hit the network to
# decide whether to publish.
#
# Usage:
#   publish-skills.sh [--dry-run]
#
# Env:
#   GH_TOKEN / GITHUB_TOKEN   auth for `gh` (PAT locally, GITHUB_TOKEN in CI)
#
# Sections: Setup | Helpers | Publish
set -euo pipefail

# --- Setup ---

# Paths
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
skills_dir="$root/dot_claude/skills"
dist="$root/dist/skills"
lock="$here/skills.lock.json"

# Preflight
dry_run=0
[[ "${1:-}" == "--dry-run" ]] && dry_run=1

command -v jq >/dev/null || {
  echo "jq is required" >&2
  exit 1
}
command -v gh >/dev/null || {
  echo "gh CLI is required" >&2
  exit 1
}
[[ -f "$lock" ]] || echo '{}' >"$lock"
mkdir -p "$dist"

# --- Helpers ---

# Deterministic content hash of a skill dir: every file, sorted, hashed by name
# and content, then folded into one digest. macOS metadata junk is excluded so a
# stray .DS_Store never triggers a phantom re-release.
skill_hash() {
  local dir="$1"
  (cd "$dir" && find . -type f ! -name '.DS_Store' ! -path '*/__MACOSX/*' -print0 |
    sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
}

# X.Y.Z -> X.Y.(Z+1)
bump_patch() {
  local IFS=. major minor patch
  read -r major minor patch <<<"$1"
  echo "${major}.${minor}.$((patch + 1))"
}

# --- Publish ---

# Working state: counters plus a scratch copy of the lock we mutate and swap in at the end
published=0
skipped=0
tmp_lock="$(mktemp)"
cp "$lock" "$tmp_lock"

# Loop over skills, releasing each that changed
shopt -s nullglob
for dir in "$skills_dir"/*/; do
  # Identify the skill and its last-published state
  [[ -f "$dir/SKILL.md" ]] || continue # not a skill without a manifest
  name="$(basename "$dir")"
  hash="$(skill_hash "$dir")"

  old_hash="$(jq -r --arg n "$name" '.[$n].hash // ""' "$tmp_lock")"
  old_ver="$(jq -r --arg n "$name" '.[$n].version // ""' "$tmp_lock")"

  # Decide the version: new skill, unchanged (skip), or bump on content change
  if [[ -z "$old_ver" ]]; then
    version="0.1.0" # first release of a new skill
  elif [[ "$hash" == "$old_hash" ]]; then
    echo "= $name $old_ver (unchanged)"
    skipped=$((skipped + 1))
    continue
  else
    version="$(bump_patch "$old_ver")"
  fi

  # Build the zip and cut the release
  tag="${name}-v${version}" # per-skill release tag, e.g. organize-v0.1.1
  zip="$dist/${name}-${version}.zip"
  rm -f "$dist/${name}-"*.zip
  (cd "$dir" && zip -rqX "$zip" . -x '*.DS_Store' -x '__MACOSX*')

  if ((dry_run)); then
    echo "~ $name -> $version (dry-run, would create release $tag)"
  else
    # The --repo flag keeps the release on THIS repo; tag is created on the current commit.
    gh release create "$tag" "$zip" \
      --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" \
      --title "$name v$version" \
      --notes "$(
        # shellcheck disable=SC2016  # %s are printf format specs, filled by args
        printf 'Auto-published skill `%s` v%s.\n\ncontent-hash: `%s`' "$name" "$version" "$hash"
      )"
    echo "+ $name -> $version (release $tag)"
  fi

  # stage the new version+hash in the working lock copy
  jq --arg n "$name" --arg v "$version" --arg h "$hash" \
    '.[$n] = {version: $v, hash: $h}' "$tmp_lock" >"$tmp_lock.next" && mv "$tmp_lock.next" "$tmp_lock"
  published=$((published + 1))
done

# Finalize
if ((dry_run)); then
  rm -f "$tmp_lock"
  echo "dry-run: $published would publish, $skipped unchanged"
  exit 0
fi

mv "$tmp_lock" "$lock"
echo "done: $published published, $skipped unchanged"
if ((published > 0)); then
  echo "note: commit $lock so the new versions/hashes are tracked."
fi
