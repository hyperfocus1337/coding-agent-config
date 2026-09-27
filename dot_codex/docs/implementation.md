# Implementation notes

Why [`AGENTS.md.tmpl`](../AGENTS.md.tmpl) and [`hooks/apply-patch.sh`](../hooks/apply-patch.sh) exist and how they work. [README.md](../README.md) describes the directory; this file is for a person changing them. Written against Codex CLI 0.154.0 and measured on 2026-09-26.

## Instructions: `AGENTS.md.tmpl`

Codex reads one user instruction file, `~/.codex/AGENTS.md`. It has no rules directory, and it does not open a file that an instruction file links to. `CLAUDE.md` holds one sentence that links to the rules, so a symlink to `CLAUDE.md`, as pi uses, gives Codex no rules. pi loads the rules through an extension; Codex has no extension point for this.

The template joins the files when chezmoi applies:

1. `include "dot_claude/CLAUDE.md"`.
2. `glob` over `dot_claude/rules/*.md`, from `.chezmoi.sourceDir`. A new rule needs no template change.
3. Skip `README.md`, and skip a rule that starts with `---`. Frontmatter means `paths:` scoping, and inlined without it the rule would apply to every file.

The output is a plain file, not a link, so a rule edit reaches Codex only on the next `just chezmoi`. `CLAUDE.md` holds only its `# Global agent instructions` heading, so the `##` rule headings sit under it. It must not link to the rules: Codex does not load `~/.claude/rules/`, and a model that follows a link reads a rule a second time.

The project rule of this repository takes a different route: `AGENTS.md` at the repository root is a symlink to `.claude/rules/apply.md`. Codex follows it. `.chezmoiignore` lists `AGENTS.md`, because the repository root is the chezmoi source and would otherwise render `~/AGENTS.md`. `dot_claude/settings.json` sets the `instructionFiles` option of the built-in `agents-md@builtin` plugin to `claude-md`, under `pluginConfigs`, which stops Claude Code from loading the same rule through `AGENTS.md`. Measured 2026-09-26 on Claude Code 2.1.283: a top-level `instructionFiles` key has no effect, and without the plugin option a repository with no `CLAUDE.md` gets its `AGENTS.md` loaded.

## File hooks: `apply-patch.sh`

### The problem

The file hooks `format-all-languages`, `format-org-tables`, `lint-all-languages`, and `lint-prose` must know which file changed. Claude Code tells them. Codex does not.

When Claude Code edits a file, it uses the Write or Edit tool. The hook gets the file path:

```json
{ "tool_name": "Write", "tool_input": { "file_path": "/repo/README.md" } }
```

Codex has no Write or Edit tool. It edits every file through one tool, `apply_patch`. The hook gets the whole patch as text and no `file_path`:

```json
{
  "tool_name": "apply_patch",
  "tool_input": {
    "command": "*** Begin Patch\n*** Update File: README.md\n@@ ...\n*** Add File: src/app.py\n..."
  }
}
```

With no `file_path`, each hook takes its Bash branch, which guesses the files from a shell command:

- `format-all-languages` formats only the markdown files that git shows as changed. It skips `src/app.py`.
- `lint-all-languages`, `lint-prose`, and `format-org-tables` search the text for strings that look like file names. A patch is not a shell command, so they miss files or pick wrong ones.

Without the wrapper, most files that Codex edits are not formatted or linted.

### What the wrapper does

`hooks.json` calls the wrapper once per file hook on the `apply_patch` matcher, with the hook script as the argument:

```sh
bash "$HOME/.codex/hooks/apply-patch.sh" "$HOME/.claude/hooks/lint-all-languages/hook.sh"
```

1. Read the patch text from `tool_input.command`. Take the paths on the `*** Add File:`, `*** Update File:`, and `*** Move to:` lines. Resolve a relative path against the payload's `cwd`.
2. Skip a path that is not a file on disk: a deleted file, or the old side of a move.
3. For each path, copy the payload, set `tool_name` to `Write` and `tool_input` to `{file_path: <path>}`, and send it to the hook. The hook takes its single-file branch, as under Claude Code. `hook_event_name`, `cwd`, and the other fields stay unchanged.
4. Return one exit code to Codex. Exit 2 wins, because only 2 blocks the tool result and sends stderr to the model. Otherwise the highest code wins, so a crash (126, 127) still shows as a warning.

### Why a wrapper and not a hook change

The Claude Code hooks stay unchanged and do not need to know about Codex. All Codex-specific logic is in one file under `~/.codex/`. A second Codex tool that edits files needs a change here only.

### Constraints

- **Stdout.** The wrapper passes each hook's stdout through. In the single-file branch, no hook writes to stdout now. If a hook starts to print JSON there, a multi-file patch gives Codex several JSON objects, and Codex rejects the output.
- **Timeout.** The `timeout` of a `hooks.json` entry covers the whole wrapper, so it covers N hook runs in sequence for an N-file patch. The values are copied from the single-run Claude Code entries. Not measured for large patches.
- **No PostToolUseFailure.** Codex has no such event. A Bash command that writes a file and then exits non-zero gets no format pass under Codex.
- **Trust.** The trust hash covers the `hooks.json` entry, not the script. An edit to the wrapper needs no new trust.

### Test

[`hooks/test/test.sh`](../hooks/test/test.sh) runs the wrapper against a stub hook. It covers Add, Update, Delete, and Move lines, a relative path with a space, the exit code rules, a patch with no file lines, and a missing hook argument.
