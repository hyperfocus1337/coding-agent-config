---
name: install-bootstrap
description: Install the cloud bootstrap hook into a repository, so a Claude Code cloud session (web, Android, CI) starts with the same skills, commands, rules, hooks, and MCP servers as a local machine. Merges one SessionStart hook and the attribution settings into the target repo's .claude/settings.json; the hook fetches bootstrap.sh at session start. Use for "bootstrap this repo for the web", "make this repo work on claude.ai/code", "set up cloud sessions", "add the SessionStart bootstrap hook", "Android session has none of my config". Entry point is the install-agent-resources skill.
disable-model-invocation: true
---

# install-bootstrap

Merges [`assets/settings.json`](assets/settings.json) into a target repository's `.claude/settings.json`. The file holds one `SessionStart` hook and the `attribution` settings. The hook fetches [`templates/web/bootstrap.sh`](../../../templates/web/bootstrap.sh) over https and pipes it to bash at the start of every cloud session. The script installs the portable config with chezmoi and the full APM manifest. Its human companion is [`templates/web/README.md`](../../../templates/web/README.md).

With the `minimal` profile, the skill also merges [`settings-minimal.json`](../../settings-minimal.json) into the same file. Nothing else reaches the target repo. The skill reads both files from `~/.claude`, where chezmoi puts them, so it needs no network access and no push.

## When to use

The user wants a repository to work in a Claude Code cloud session (claude.ai/code, Android, CI). For MCP servers use `install-mcp`. For skills use `install-skills`. For plugins use `install-plugins`.

## Inputs you gather (ask the user)

1. **Target repository**: the current working directory unless told otherwise.
2. **Settings profile**: `minimal` (the default) or `full`. See [Profiles](#profiles).
3. **Commit or not**: the write lands in a repository that is usually not this one. Ask before committing.

There is no scope question. See [Scope](#scope).

## Profiles

| Profile             | Merges                                               |
| :------------------ | :--------------------------------------------------- |
| `minimal` (default) | `assets/settings.json`, then `settings-minimal.json` |
| `full`              | `assets/settings.json` only                          |

Locally, `settings.json` sets `attribution` and the `claude` shell function adds `settings-minimal.json` with `--settings`. A cloud session starts without either. The bootstrap writes `~/.claude/settings.json` during `SessionStart`, which is too late: Claude Code builds the permission rules before `SessionStart` runs, so a deny that the hook writes does not apply in that session. Only the repository can carry these keys.

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

Check `jq` is on `PATH`.

### 1. Locate the target repository

Default to the current working directory. Confirm it is a git repository with `git -C <target> rev-parse --git-dir`. A directory that is not a repository cannot deliver the hook to a cloud session, so stop and say so.

### 2. Merge the settings

Run this once for each file of the profile, in the order of [Profiles](#profiles). `<src>` is `~/.claude/skills/install-bootstrap/assets/settings.json` or `~/.claude/settings-minimal.json`:

```bash
cd <target>
mkdir -p .claude
[ -f .claude/settings.json ] || echo '{}' > .claude/settings.json
jq --slurpfile m <src> -f ~/.claude/skills/install-bootstrap/scripts/merge.jq \
  .claude/settings.json > .claude/settings.json.tmp \
  && mv .claude/settings.json.tmp .claude/settings.json
```

[`scripts/merge.jq`](scripts/merge.jq) keeps every key of the existing file. It merges objects key by key and appends only the array items that the repository does not have yet. A repository that an earlier run bootstrapped already has the same hook object, so it does not get a second hook, and a re-run adds only what changed in the source files. For any other value, such as `attribution.commit` or a `disable*` key, the source wins. The filter drops `$schema`, `$comment`, and each `disable*` key set to `false`, because `false` is the same as not set.

Never overwrite `.claude/settings.json`. The `&&` chain protects it: if `jq` fails, the existing file stays unchanged. The cause is a missing `<src>` or a `settings.json` that is not valid JSON. On failure, delete `.claude/settings.json.tmp`, stop, and report the error. For invalid JSON, tell the user to fix their `settings.json`.

The skill reads the copies that chezmoi applied, not the source tree. A source edit reaches the target after `just chezmoi`.

### 3. Ask to commit

Show the user the resulting file.

The hook only fires for a cloud session that clones the repository, so an uncommitted hook does nothing. Ask before committing, because the target is usually not the config repository.

Check first that the file can be committed at all:

```bash
git -C <target> check-ignore -q .claude/settings.json
```

Exit 0 means the repository ignores the file. `git add` then does nothing and the hook never reaches a cloud session. Report this and ask the user to un-ignore `.claude/settings.json` before continuing. Some repositories ignore the whole `.claude/` directory.

### 4. Report

There is no verify step. `bootstrap.sh` exits immediately unless `CLAUDE_CODE_REMOTE=true`, so the hook cannot be tested from a local session. State this, then report:

- **Keys written**: the hook, the deny entries, and the keys that step 2 added or changed. Name each `attribution` value that replaced a different value in the repository.
- **Teammates**: everyone who opens the repository with Claude Code gets the hidden attribution, and with `minimal` also the denies and the turned-off features.
- **Removal**: a later run never removes a key. A tool removed from `settings-minimal.json` stays denied until the user deletes it from the repository's `settings.json`.
- **Secrets**: the APM MCP servers that interpolate `${TESSL_TOKEN}` and `${CONTEXT7_API_KEY}` register regardless, but only work if those variables are set in the platform's environment settings before the session starts. An unset variable does not fail the install.
- **Skipped**: the bootstrap installs no Claude plugins from the marketplace and no playwright browser binaries, to keep the session start under 5 minutes.
- **Full parity**: a session that needs the skipped parts runs `~/coding-agent-config/scripts/extensions/install.sh` once after it starts.

With `minimal`, also report:

- **`claude-full`**: in this repository it still gets the minimal keys. A `disable*` key can be turned back on for one session, because `--settings` overrides project settings: `claude-full --settings '{"disableBundledSkills":false}'`. A deny cannot, because a deny from any scope applies.
- **claude.ai MCP servers**: the `claude` shell function also sets `ENABLE_CLAUDEAI_MCP_SERVERS=false`. To get that in the cloud, set the variable in the platform's environment settings.

## Notes

- The hook URL is pinned to `main`, so every bootstrapped repository runs the current script. A change to `bootstrap.sh` reaches them all on their next session, with no re-install here.
- `templates/web/bootstrap.sh` cannot move or be renamed. Its path is part of the URL in every repository already bootstrapped, and `raw.githubusercontent.com` does not redirect.
- Step 2 needs this config applied with chezmoi: it reads `~/.claude/settings-minimal.json` and the skill's own files from `~/.claude`.
- Do not change the hook object in `assets/settings.json`. The merge matches it by value, so a changed object adds a second hook next to the old one in each repository where the skill runs again, and the installer then runs twice per session. Put the change in `bootstrap.sh` instead.
- The `attribution` values copy `dot_claude/settings.json.tmpl`, which sets them for local sessions. Change both together.
