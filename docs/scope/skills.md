# Project-scoped agent skills

A skill installed at user scope adds its name and description to every session, in every repo. Most skills answer a question that only one kind of repo asks. This page explains the skill catalog, which records where each skill belongs. The machine-readable source of truth is [`dot_claude/skills/install-skills/references/skills.json`](../../dot_claude/skills/install-skills/references/skills.json); when this page and the catalog disagree, the catalog wins.

Which skills a package deploys is not in the catalog. The root [`apm.yml`](../../apm.yml) declares that, and an `apm` row names only the package, so the subset is written once. The four install channels and their declaration files are mapped in [`docs/sources/channels.md`](../sources/channels.md).

## Installing

Ask Claude to "install the <skill> skill in this project", or invoke the `install-agent-resources` skill and pick the skill channel. The skill asks for the scope, then follows the channel's procedure:

- **APM**: `apm install <ref> --target claude` in the project, which writes `.claude/skills/`, `apm.yml`, and `apm.lock.yaml`, and gitignores `apm_modules/`. A skill subset (neon takes 3 of the package's skills) repeats `--skill <name>` per skill; apm writes the names into the `skills:` key of the package entry and unions them across runs. A repo whose root has no `apm.yml` or `SKILL.md` (cmux, 22 skills under `skills/`) cannot be subset: the row's `id` carries a `<name>` placeholder and its `skills` list names the 7 to install, one `apm install manaflow-ai/cmux/skills/<name>` each.
- **Local**: copy the directory out of this repo into `<project>/.claude/skills/`. The copy forks. Later edits here do not reach it.
- **Vendor CLI**: run the vendor's command in the project. Both vendor CLIs install into the project by default and need an explicit argument for user scope, which is the reverse of the plugin CLI. Each row splits `command` from `project_args` and `global_args`, because the two scopes need different paths, not just a flag.

## Reading the catalog

Print the current table from the catalog rather than copy it into this page:

```
just skill-catalog
```

Print the candidates to move off user scope, with the reason for each:

```
just skill-candidates
```

Both recipes are in the [`justfile`](../../justfile). They read the catalog in this repo, not the copy in `~/.claude/`.

## Where Claude reads skills from

Claude reads `.claude/skills/` in the project and `~/.claude/skills/` for the user. It does **not** read `.agents/skills/`, which is the Codex and cross-agent location. This matters for `glab skills install`, whose default output is `.agents/skills/`: the catalog row carries `--path .claude/skills` so the skill lands where Claude will find it. Serving both agents from one directory is possible with a symlink or a local plugin wrapper, covered in [`docs/research/codex-compat.md`](../research/codex-compat.md).

## Cost

Only the name and description of a skill are loaded at session start. The body of `SKILL.md`, its `references/`, and its `scripts/` cost nothing until the skill runs. A skill with `disable-model-invocation: true` costs nothing at all and cannot be auto-selected, only invoked by name. Per-skill measurements come from [`scripts/context-budget/measure-context.py`](../../scripts/context-budget/measure-context.py) and are recorded in [`docs/research/skills-context.md`](../research/skills-context.md).
