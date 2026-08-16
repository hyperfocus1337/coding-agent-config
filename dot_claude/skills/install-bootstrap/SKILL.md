---
name: install-bootstrap
description: Install the cloud bootstrap hook into a repository, so a Claude Code cloud session (web, Android, CI) starts with the same skills, commands, rules, hooks, and MCP servers as a local machine. Writes one SessionStart hook into the target repo's .claude/settings.json; the hook fetches bootstrap.sh at session start. Use for "bootstrap this repo for the web", "make this repo work on claude.ai/code", "set up cloud sessions", "add the SessionStart bootstrap hook", "Android session has none of my config". Entry point is the install-agent-resources skill.
disable-model-invocation: true
---

# install-bootstrap

Installs one `SessionStart` hook into a target repository. The hook fetches [`templates/web/bootstrap.sh`](../../../templates/web/bootstrap.sh) over https and pipes it to bash at the start of every cloud session. The script installs the portable config with chezmoi and the full APM manifest. Its human companion is [`templates/web/README.md`](../../../templates/web/README.md).

Nothing else reaches the target repo. The bootstrap script itself stays hosted in this repository, so the target never carries a copy to keep in sync.

## When to use

The user wants a repository to work in a Claude Code cloud session (claude.ai/code, Android, CI). For MCP servers use `install-mcp`. For skills use `install-skills`. For plugins use `install-plugins`.

## Inputs you gather (ask the user)

1. **Target repository**: the current working directory unless told otherwise.
2. **Commit or not**: the write lands in a repository that is usually not this one. Ask before committing.

There is no scope question. See [Scope](#scope).

## Scope

Project scope only. Do not offer `local` or `user`.

| Scope   | Why it is not offered                                                                        |
| :------ | :------------------------------------------------------------------------------------------- |
| `local` | `.claude/settings.local.json` is gitignored, so the cloud session clones the repo without it |
| `user`  | a cloud session starts from a fresh image, so nothing on this machine reaches it             |

A cloud session sees only what the repository commits. The hook must be committed to fire.

## Procedure

### 0. Preflight the toolchain

Check `jq` and `sponge` are on `PATH`. Step 3 needs both.

### 1. Locate the target repository

Default to the current working directory. Confirm it is a git repository with `git -C <target> rev-parse --git-dir`. A directory that is not a repository cannot deliver the hook to a cloud session, so stop and say so.

### 2. Check whether the hook is already installed

```bash
rg -q 'templates/web/bootstrap.sh' <target>/.claude/settings.json
```

A match means the repository is already bootstrapped. Report that and stop. Never write a second copy: two hooks run the installer twice per session.

### 3. Write the hook

Create the file when it is missing, then append. `jq` merges into any existing config and keeps every other key:

```bash
cd <target>
mkdir -p .claude
[ -f .claude/settings.json ] || echo '{}' > .claude/settings.json
jq --argjson block '{"matcher":"startup","hooks":[{"type":"command","command":"curl -fsSL https://raw.githubusercontent.com/hyperfocus1337/coding-agent-config/main/templates/web/bootstrap.sh | bash"}]}' \
  '.hooks.SessionStart = ((.hooks.SessionStart // []) + [$block])' \
  .claude/settings.json | sponge .claude/settings.json
```

The assignment creates `.hooks` and `.hooks.SessionStart` when either is absent, and appends when the repository already declares other `SessionStart` hooks. Never overwrite `.claude/settings.json`.

Show the user the resulting file.

### 4. Ask to commit

The hook only fires for a cloud session that clones the repository, so an uncommitted hook does nothing. Ask before committing, because the target is usually not the config repository.

### 5. Report

There is no verify step. `bootstrap.sh` exits immediately unless `CLAUDE_CODE_REMOTE=true`, so the hook cannot be tested from a local session. State this, then report:

- **Secrets**: the APM MCP servers that interpolate `${TESSL_TOKEN}` and `${CONTEXT7_API_KEY}` register regardless, but only work if those variables are set in the platform's environment settings before the session starts. An unset variable does not fail the install.
- **Skipped**: the bootstrap installs no Claude plugins from the marketplace and no playwright browser binaries, to keep the session start under 5 minutes.
- **Full parity**: a session that needs the skipped parts runs `~/coding-agent-config/scripts/extensions/install.sh` once after it starts.

## Notes

- The hook URL is pinned to `main`, so every bootstrapped repository runs the current script. A change to `bootstrap.sh` reaches them all on their next session, with no re-install here.
- `templates/web/bootstrap.sh` cannot move or be renamed. Its path is part of the URL in every repository already bootstrapped, and `raw.githubusercontent.com` does not redirect.
- The hook block in step 3 is the single declaration of the bootstrap. `templates/web/` holds the script and its documentation, not a copyable settings file.
