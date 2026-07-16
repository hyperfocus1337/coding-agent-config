# publish-skills

Packages every skill in [`dot_claude/skills/`](../../dot_claude/skills/) as a `.zip` and publishes it as a versioned **GitHub Release asset** on this repository. A skill is only re-published when its content actually changes; when it does, the patch version auto-increments.

## How versioning works

[`skills.lock.json`](skills.lock.json) is the source of truth. For each skill it stores the current `version` and a `content-hash` (a digest of every file in the skill folder, macOS metadata excluded). On each run the script re-hashes each skill and:

- **new skill** (not in the lock) → published at `0.1.0`
- **hash unchanged** → skipped, nothing published
- **hash changed** → patch bumped (`0.1.0` → `0.1.1`), re-published

Because the decision comes from the committed lock file, no network call is needed to know whether to publish. Each release is tagged `<skill>-v<version>` (e.g. `organize-v0.1.1`) with the `.zip` attached as an asset.

## Running it

Locally (needs `gh` authenticated with `repo`/`contents:write` scope, plus `jq`):

```bash
just publish-skills           # detect changes, publish, update the lock
just publish-skills-dry        # show what would publish, touch nothing
```

Or call the script directly:

```bash
./scripts/publish/publish-skills.sh [--dry-run]
```

After a local publish, **commit `skills.lock.json`** so the new versions and hashes are tracked. The script reminds you.

## CI

[`.github/workflows/publish-skills.yml`](../../.github/workflows/publish-skills.yml) runs the same script on every push to `main` that touches `dot_claude/skills/**`. It uses the built-in `GITHUB_TOKEN`, publishes changed skills, and commits the updated lock file back with `[skip ci]`.

## Notes

- Release tags are immutable. If the lock says a skill needs publishing but its tag already exists (lock drifted from releases), `gh` fails loudly rather than silently overwriting.
- The zip layout puts `SKILL.md` at the archive root, which is what the Claude Desktop skill importer expects.
