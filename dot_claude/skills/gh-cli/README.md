# gh-cli skill

Source: https://github.com/github/awesome-copilot/blob/main/skills/gh-cli/SKILL.md

## Why this skill is maintained locally (not via apm)

This skill is kept in the repo and rendered by chezmoi rather than pulled through `apm.yml`. We looked at offloading it to apm on 2026-07-14 and decided against it for now.

There is no drop-in upstream replacement. This `SKILL.md` is a comprehensive command reference (a lookup cheatsheet covering every `gh` subcommand, pinned to a known gh version). The apm-installable options we found are a different kind of skill: task workflows that trigger on GitHub URLs and drive `gh`/`git` on your behalf, not a reference you read, so swapping would change behavior rather than preserve it. `mattpocock/skills` (already in `apm.yml`) has no gh skill at all, and no apm marketplace is configured, so registry search is not an option today.

The maintenance burden is also small. The `gh` command surface is stable, so this reference rarely needs updates, which is the opposite of the churn apm is most useful for absorbing.

If a proper gh command reference skill ever appears in a git repo, moving to apm is a two-line addition under `dependencies.apm` (a `git:` entry plus the skill name), mirroring the existing `mattpocock/skills` block, and this local copy can then be deleted.
