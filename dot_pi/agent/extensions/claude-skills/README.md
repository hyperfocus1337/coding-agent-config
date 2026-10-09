# claude-skills

Adds approved `<cwd>/.claude/skills` to pi's native skill loader through `resources_discover`. Skill detection is separate from command registration and rule injection.

Enable [claude-project](../claude-project/README.md) for project approval. The commands and rules extensions can be disabled. Without the coordinator's approval event or an existing skills path, this extension supplies no paths. A project with only commands or rules does not produce a missing-skills warning.

User skills remain configured by the global `skills` array, including `~/.claude/skills` and its existing exclusions. Relative paths in global settings resolve from the agent directory, not the current project, which is why local skills need this hook.

Pi validates skill frontmatter, advertises skills in the system prompt, and provides `/skill:name` commands. The first loaded skill wins a name conflict, so a local skill does not override a user skill with the same name. Run pi from the project root and use `/reload` after adding or changing skills.

## Checks

Run `node test/check.ts` or `just pi-check`. The check runs without commands or rules and covers missing approval, an approved project with no skills directory, approved discovery, stable repeated discovery, removal of the skills directory, denial, and invalid event payloads.

See [implementation notes](docs/implementation.md) for the two hooks.
