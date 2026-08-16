---
name: install-skills
description: Install an agent skill for any AI harness at project, local, or user scope through APM, a repo-local copy, or a vendor CLI, so a skill costs context only where it is used. Use for "install skill", "add skill to this project", "project-scoped skill", "install a skill for codex or cursor", "move a skill off global", "install the neon or cmux skills here". Entry point is the install-agent-resources skill.
disable-model-invocation: true
---

# install-skills

Installs agent skills into a scope you choose: `project` (committed, every collaborator gets it on clone), `local` (gitignored, this machine only), or `user` (global, every session). The catalog is [`references/skills.json`](references/skills.json); its human companion is [`docs/skills/project-skills.md`](../../../docs/skills/project-skills.md).

The target harness is a separate choice from the scope. APM deploys one package to any of its supported harnesses (`claude`, `codex`, `cursor`, `gemini`, `copilot`, `opencode`, `windsurf`, `kiro`, and more; `apm install --help` lists the current set). Each harness has its own skills directory. This document writes `<skills-dir>` for it: `.claude/skills/` for Claude Code, `.agents/skills/` for Codex. Verified with apm 0.28: the `codex` target deploys skills to `.agents/skills/`, although `apm targets` prints `.codex/` as its deploy dir, which is where its MCP config goes.

Skills reach an agent through three channels here. A plugin that bundles skills is the fourth, and belongs to `install-plugins`.

| Channel      | Installed by             | Lands in                                                              |
| :----------- | :----------------------- | :-------------------------------------------------------------------- |
| `apm`        | `apm install <ref>`      | `<skills-dir>/<name>/` per target, plus `apm.yml` and `apm.lock.yaml` |
| `local`      | copy the directory       | `<skills-dir>/<name>/`                                                |
| `vendor-cli` | the vendor's own command | wherever that command writes, see the row                             |

## When to use

The user wants a skill available in one repo instead of every session, or wants to know which installed skills are candidates to move off user scope. For MCP servers use `install-mcp`. For plugins use `install-plugins`.

## Inputs you gather (ask the user)

1. **Which skill**, by name or by need. Resolve against the catalog first.
2. **Which scope**: `project`, `local`, or `user`. Ask every time. Preselect the row's `scope`.
3. **Which harnesses**: one or more APM targets, comma separated. Present `claude` as the default. Offer the other harnesses the project already configures, which `apm targets` reports, and the wider APM list on request. For the `local` and `vendor-cli` channels this decides the skills directory to write into.
4. **Target project**: the current working directory unless told otherwise.

## The catalog

| Field          | Meaning                                                              |
| :------------- | :------------------------------------------------------------------- |
| `id`           | skill name for `local` and `vendor-cli` rows, git ref for `apm` rows |
| `channel`      | `apm`, `local`, or `vendor-cli`, which decides the procedure below   |
| `dir`          | source directory in the config repo, `local` rows only               |
| `command`      | the vendor command, without scope arguments, `vendor-cli` rows only  |
| `project_args` | arguments that land the skill in the project, appended to `command`  |
| `global_args`  | arguments that land it at user scope instead                         |
| `scope`        | where this skill belongs: `user`, `project`, or `local`              |
| `status`       | `user-keep`, `project-candidate`, `local-candidate`                  |
| `requires`     | binaries that must be on `PATH`                                      |
| `why`          | the reason for `scope`, including its measured resident token cost   |
| `use_when`     | the condition under which a project should take it                   |

An `apm` row names the package, never its skills. Which skills that package deploys is read live from the root [`apm.yml`](../../../apm.yml), so the subset is declared once.

## Procedure

### 0. Preflight

Check the binaries the chosen channel needs: `apm` for the `apm` channel, `uv` as well when a subset needs the merge helper, and each `requires` entry of the row. Read the catalog and, for `apm` rows, the root `apm.yml`.

### 1. Resolve the request to a row

Match on `id` first, then on `use_when`. Show the row's `why` and `use_when`, and for an `apm` row list the skills the package currently declares.

For a skill not in the catalog, ask which channel it arrives through and continue. Offer to add a row in step 4.

### 2. Ask the scope and the harness

Present `project`, `local`, `user` with the row's `scope` preselected. State the consequence in one line each: project is committed and reaches collaborators, local is gitignored, user loads in every session and costs resident tokens.

Then confirm the target harnesses, with `claude` preselected. Run `apm targets` in the project first and add the harnesses it reports as active to the choice.

### 3. Install, by channel

**APM, whole package.** Run in the project directory, with the harnesses of step 2:

```bash
apm install <git-ref> --target <harnesses>
```

This writes `<skills-dir>` for each target, creates `apm.yml` and `apm.lock.yaml`, and adds `apm_modules/` to `.gitignore`. Commit `apm.yml` and `apm.lock.yaml`, never `apm_modules/`. A later `apm install` in that project reuses the `targets:` list the first run wrote, so a second harness needs `--target` again.

**APM, skill subset.** `apm install` has no flag for taking some skills of a package, so write the subset into `apm.yml` first, then install:

```bash
uv run ~/.claude/skills/install-skills/scripts/merge_apm_skills.py \
  --project <project-dir> \
  --targets <harnesses> \
  --deps-json '[{"git": "neondatabase/agent-skills", "skills": ["neon", "neon-postgres"]}]'
apm install --only apm
```

The helper unions a subset into an existing entry for the same package, so adding one skill never drops another. `--only apm` leaves any MCP servers in that manifest untouched.

**Local.** Copy the directory from the config repo into the project:

```bash
cp -r <config-repo>/<dir> <project-dir>/<skills-dir>/<id>
```

Copy once per target harness. Then ask whether to commit it or add it to `.gitignore`. Say plainly that the copy forks: later edits in the config repo do not reach it.

**Vendor CLI.** Run `command` plus `project_args` from the project root. Replace the literal `$SKILLS_DIR` in the args with the skills directory of the target harness, `.claude/skills` for Claude, `.agents/skills` for Codex. `scripts/extensions/skills/install.sh` expands the same placeholder, so the catalog holds no harness name. The args are split from the command because the two scopes need different ones: `glab skills install` writes `.agents/skills/`, so both arg sets carry `--path`, and `global_args` prefixes it with `$HOME`. Confirm the files arrived under `<skills-dir>` and ask commit or gitignore.

**User scope, any channel.** For `apm`, add the dep to the root `apm.yml` of the config repo with the same merge helper (`--project <config-repo>`), then run `scripts/extensions/apm/install.sh`. That manifest carries its own `targets:` list, today `claude` only; a skill for another harness needs that harness added there, which fans every dep of the manifest out to it. For `local`, the skill is already deployed by chezmoi; a new one means creating it under `dot_claude/skills/` and running `just chezmoi`. For `vendor-cli`, run the command with its `global_args`, and add the row to the catalog so `scripts/extensions/skills/install.sh` reproduces it.

### 4. Record a user-scope install in the config repo

Only for `user` scope, and only after the user confirms the write.

Locate the config repo in this order: `$AGENT_CONFIG_REPO`, then `/workspaces/coding-agent-config` if it exists, then ask.

Add or update the row in `<config-repo>/dot_claude/skills/install-skills/references/skills.json`, with `scope: "user"`, a `why`, and a `use_when`. `scripts/extensions/skills/install.sh` installs every `scope: "user"` row of the `vendor-cli` channel, and the root `apm.yml` carries the `apm` ones, so an unrecorded user-scope skill disappears on the next clean rebuild.

### 5. Report

State the scope, the harnesses, the channel, the files written, and whether the skill is committed or gitignored. A new skill is picked up on the next session.

## Notes

- Resident cost is per skill description, paid in every session where the skill is installed. Numbers in `why` come from `scripts/context-budget/measure-context.py`.
- A skill with `disable-model-invocation: true` costs nothing in the listing and cannot be auto-selected. It stays invocable by exact name.
- Claude reads `.claude/skills/` only. `.agents/skills/` is the cross-agent location that Codex and several vendor CLIs use, and the directory APM deploys to for the `codex` target. `docs/research/codex-compat.md` covers the symlink and plugin-wrapper options for serving both.
- Uninstalling is not part of this skill. Removing a user-scope skill means deleting its row, and the directory it deployed to.
