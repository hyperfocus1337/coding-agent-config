---
name: install-bootstrap
description: Install the cloud bootstrap hook into a repository, so a Claude Code cloud session (web, Android, CI) starts with the same skills, commands, rules, hooks, and MCP servers as a local machine. Writes one SessionStart hook into the target repo's .claude/settings.json; the hook fetches bootstrap.sh at session start. Use for "bootstrap this repo for the web", "make this repo work on claude.ai/code", "set up cloud sessions", "add the SessionStart bootstrap hook", "Android session has none of my config". Entry point is the install-agent-resources skill.
disable-model-invocation: true
---

# install-bootstrap

Installs one `SessionStart` hook into a target repository. The hook fetches [`templates/web/bootstrap.sh`](../../../templates/web/bootstrap.sh) over https and pipes it to bash at the start of every cloud session. The script installs the portable config with chezmoi and the full APM manifest. Its human companion is [`templates/web/README.md`](../../../templates/web/README.md).

With the `minimal` profile, the skill also merges the keys of [`settings-minimal.json`](../../settings-minimal.json) into the same file. Nothing else reaches the target repo. The bootstrap script and the minimal settings stay hosted in this repository, so the target never carries a copy to keep in sync.

## When to use

The user wants a repository to work in a Claude Code cloud session (claude.ai/code, Android, CI). For MCP servers use `install-mcp`. For skills use `install-skills`. For plugins use `install-plugins`.

## Inputs you gather (ask the user)

1. **Target repository**: the current working directory unless told otherwise.
2. **Settings profile**: `minimal` (the default) or `full`. See [Profiles](#profiles).
3. **Commit or not**: the write lands in a repository that is usually not this one. Ask before committing.

There is no scope question. See [Scope](#scope).

## Profiles

| Profile             | Writes                                                                          |
| :------------------ | :------------------------------------------------------------------------------ |
| `minimal` (default) | the hook, plus the deny list and the `disable*` keys of `settings-minimal.json` |
| `full`              | the hook only                                                                   |

Locally, the `claude` shell function adds `settings-minimal.json` with `--settings`. A cloud session starts without that function, so only the repository can carry these keys. The hook cannot write them either: Claude Code builds the permission rules before `SessionStart` runs, so a deny that the hook writes does not apply in that session.

Offer `minimal` first. When you ask, tell the user that it applies to everyone who opens the repository with Claude Code, teammates included.

## Scope

Project scope only. Do not offer `local` or `user`.

| Scope   | Why it is not offered                                                                        |
| :------ | :------------------------------------------------------------------------------------------- |
| `local` | `.claude/settings.local.json` is gitignored, so the cloud session clones the repo without it |
| `user`  | a cloud session starts from a fresh image, so nothing on this machine reaches it             |

A cloud session sees only what the repository commits. The hook must be committed to fire.

## Procedure

### 0. Preflight the toolchain

Check `jq` is on `PATH`. Steps 3 and 4 need it. The `minimal` profile also needs `curl`.

### 1. Locate the target repository

Default to the current working directory. Confirm it is a git repository with `git -C <target> rev-parse --git-dir`. A directory that is not a repository cannot deliver the hook to a cloud session, so stop and say so.

### 2. Check whether the hook is already installed

```bash
rg -q --no-messages 'templates/web/bootstrap.sh' <target>/.claude/settings.json
```

Exit 0 means the hook is already installed. Skip step 3: a second hook runs the installer twice per session. With `full`, report that the repository is already bootstrapped and stop. With `minimal`, go to step 4, which also updates a repository that an earlier run bootstrapped.

Any other exit means not installed, so continue. `--no-messages` is needed because a repository with no `.claude/settings.json` is the normal case, and rg exits 2 with an error on a missing file.

### 3. Write the hook

Create the file when it is missing, then append. `jq` merges into any existing config and keeps every other key:

```bash
cd <target>
mkdir -p .claude
[ -f .claude/settings.json ] || echo '{}' > .claude/settings.json
jq '.hooks.SessionStart += [{"matcher":"startup","hooks":[{"type":"command","command":"curl -fsSL https://raw.githubusercontent.com/hyperfocus1337/coding-agent-config/main/templates/web/bootstrap.sh | bash"}]}]' \
  .claude/settings.json > .claude/settings.json.tmp \
  && mv .claude/settings.json.tmp .claude/settings.json
```

`+=` creates `.hooks.SessionStart` when it is absent and appends when the repository already has other `SessionStart` hooks. Never overwrite `.claude/settings.json`.

If `jq` fails, the existing `settings.json` is not valid JSON and stays unchanged. Delete `.claude/settings.json.tmp` and tell the user to fix their `settings.json`.

### 4. Merge the minimal settings (`minimal` only)

Fetch `settings-minimal.json` from `main`, the same source as the hook, then merge it with [`scripts/merge-minimal.jq`](scripts/merge-minimal.jq):

```bash
cd <target>
curl -fsSL https://raw.githubusercontent.com/hyperfocus1337/coding-agent-config/main/dot_claude/settings-minimal.json \
  -o .claude/settings-minimal.json.tmp \
  && jq --slurpfile m .claude/settings-minimal.json.tmp -f ~/.claude/skills/install-bootstrap/scripts/merge-minimal.jq \
    .claude/settings.json > .claude/settings.json.tmp \
  && mv .claude/settings.json.tmp .claude/settings.json
rm -f .claude/settings-minimal.json.tmp
```

The filter appends the deny entries that the repository does not have yet and copies the `disable*` keys set to `true` and `enableArtifact`. It drops `$schema`, `$comment`, and each `disable*` key set to `false`, because `false` is the same as not set. A re-run adds only what changed in `settings-minimal.json` since the last run.

The `&&` chain protects the file as in step 3. A failed fetch writes nothing and stops the chain. On failure, delete the leftover `.tmp` files and report the error.

The fetch uses the pushed `main`, not this checkout. A local edit to `settings-minimal.json` reaches the target only after a push.

### 5. Ask to commit

Show the user the resulting file.

The hook only fires for a cloud session that clones the repository, so an uncommitted hook does nothing. Ask before committing, because the target is usually not the config repository.

Check first that the file can be committed at all:

```bash
git -C <target> check-ignore -q .claude/settings.json
```

Exit 0 means the repository ignores the file. `git add` then does nothing and the hook never reaches a cloud session. Report this and ask the user to un-ignore `.claude/settings.json` before continuing. Some repositories ignore the whole `.claude/` directory.

### 6. Report

There is no verify step. `bootstrap.sh` exits immediately unless `CLAUDE_CODE_REMOTE=true`, so the hook cannot be tested from a local session. State this, then report:

- **Secrets**: the APM MCP servers that interpolate `${TESSL_TOKEN}` and `${CONTEXT7_API_KEY}` register regardless, but only work if those variables are set in the platform's environment settings before the session starts. An unset variable does not fail the install.
- **Skipped**: the bootstrap installs no Claude plugins from the marketplace and no playwright browser binaries, to keep the session start under 5 minutes.
- **Full parity**: a session that needs the skipped parts runs `~/coding-agent-config/scripts/extensions/install.sh` once after it starts.

With `minimal`, also report:

- **Keys written**: the deny entries and keys that step 4 added.
- **Teammates**: everyone who opens the repository with Claude Code gets the denies and the turned-off features.
- **`claude-full`**: in this repository it still gets the minimal keys. A `disable*` key can be turned back on for one session, because `--settings` overrides project settings: `claude-full --settings '{"disableBundledSkills":false}'`. A deny cannot, because a deny from any scope applies.
- **Removal**: a later run never removes a key. A tool removed from `settings-minimal.json` stays denied until the user deletes it from the repository's `settings.json`.
- **claude.ai MCP servers**: the `claude` shell function also sets `ENABLE_CLAUDEAI_MCP_SERVERS=false`. To get that in the cloud, set the variable in the platform's environment settings.

## Notes

- The hook URL is pinned to `main`, so every bootstrapped repository runs the current script. A change to `bootstrap.sh` reaches them all on their next session, with no re-install here.
- `templates/web/bootstrap.sh` cannot move or be renamed. Its path is part of the URL in every repository already bootstrapped, and `raw.githubusercontent.com` does not redirect.
- `dot_claude/settings-minimal.json` must stay at its path too. Step 4 fetches it by URL, so the skill carries no copy of it and works on a machine without this config.
- The hook block in step 3 is the single declaration of the bootstrap. `templates/web/` holds the script and its documentation, not a copyable settings file.
