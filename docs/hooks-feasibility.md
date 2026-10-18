# Hooks as mods: feasibility

This document records whether the hooks in [`dot_claude/hooks/`](../dot_claude/hooks/README.md) can become Claude Code mods whose logic pi, omp, and Codex share. It holds the facts, a capability matrix, the result of the first spike, and a decision for each hook. A design doc follows it and covers only the hooks that this document says to port.

Tested on 2026-10-18 with Claude Code 2.1.302, pi 1.1.0, omp 18.10.3, Codex 0.162.1, and Node 26.11.1.

## Result

The port is feasible. Two spikes ported `enforce-cli-tools` and `lint-all-languages` to one TypeScript core each, with three adapters. In live sessions of Claude Code, pi, and omp, the first hook blocked a banned command, and the second hook made the model fix a file with a lint error. Three facts from the spikes change the agreed plan:

1. pi and omp do not resolve the imports of a linked extension file from the link target. Load `pi.ts` through the `extensions` setting of each agent instead of a link. See [pi and omp](#pi-and-omp).
2. A mod must spell each `$` call at the call site, with an environment variable name as a string literal. A helper that takes `$` or `$.fs` as a value is refused, but a function in the adapter that spells `$.fs.stat(path)` inside it is accepted. See [Claude Code mods](#claude-code-mods).
3. The command path (Codex only) costs 18 ms for each call, against 1.5 ms for the bash hook. The Claude Code path runs in process and starts no program.

## Agreed plan

The plan comes from the grilling session of 2026-10-18. Each line names the question that settled it.

| Topic                       | Decision                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Goal (Q1)                   | One copy of the hook logic, used by Claude Code, pi, omp, and Codex.                                                              |
| Mod or command hook (Q2)    | The shared core is the requirement. The Claude adapter is a mod where the mod API covers the hook, else a command hook.           |
| Scope (Q3)                  | All hooks. `format-staged-files` becomes a TypeScript CLI.                                                                        |
| Codex (Q4)                  | Codex keeps the 7 hooks it has today.                                                                                             |
| Behavior (Q5)               | Keep the contracts in the "Shared conventions" section of the hooks README. A behavior is dropped only by name, after approval.   |
| Layout (Q11, Q16, Q18, Q21) | Each hook is its own plugin folder and imports nothing outside it. There is no shared `lib/` or `node/` folder.                   |
| Loading (Q15)               | `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `settings.json.tmpl`.                                                             |
| Secret guard (Q20)          | `block-secret-commits` stays a command hook in Claude Code until the mod API leaves early access.                                 |
| Codex patches (Q22)         | `dot_codex/hooks/apply-patch.ts` splits an `apply_patch` payload into one payload for each file.                                  |
| Pre-commit (Q23, Q24, Q25)  | Moves to `dot_config/git/hooks/format-staged-files/`, calls the formatters' `command.ts`, and runs in any detected agent session. |
| Cutover (Q14, Q26)          | One hook for each commit. The spike becomes the first cutover commit.                                                             |

## Facts

### Claude Code mods

Source: the `plugin-authoring` skill of Claude Code 2.1.302 (`reference.md` and `types/claude-code.d.ts`), and the live tests in [Spike](#spike-enforce-cli-tools).

| Topic          | Fact                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status         | The types file says "EARLY ACCESS: this surface may change between releases without notice".                                                                                                                                                                                                           |
| Plugin shape   | `.claude-plugin/plugin.json`, plus a hooks file that names one module. The module exports `register(on, options)`.                                                                                                                                                                                     |
| Hooks file     | `hooks/hooks.json` by default. A `"hooks": "./mod.json"` field in `plugin.json` names another file. Tested live.                                                                                                                                                                                       |
| Imports        | The module imports other files of the plugin with `import` declarations. An import of `../core.ts` from `hooks/register.ts` loads. Tested live. `import()` is refused.                                                                                                                                 |
| Runtime        | No Node: no `node:` modules and no `require`. Files and processes go through `$`: `$.fs.read`, `$.fs.stat` (with `mtimeMs`), `$.process.run(argv)` (no shell, default timeout 30 s, output capped at 4 MiB for each stream), `$.env.get`, `$.session.root()`.                                          |
| Call-site rule | Each `$` call must be spelled `$.noun.call(...)` where it is used. `claude plugin validate` refuses a helper that takes `$.fs` as a value.                                                                                                                                                             |
| Environment    | `$.env.get` takes a string literal only. `claude plugin validate` lists the names that a module reads.                                                                                                                                                                                                 |
| Events         | `tool.call` wraps a tool call: `{ deny }` before `next` refuses it, and the result of `next` gives the output, including a failed Bash call. Every settings-hook event is also available as `classic.<Event>`. `classic.Stop` carries `stop_hook_active` and can block a stop. `turn.complete` cannot. |
| Failure        | A hook that throws, times out, or returns a wrong shape is skipped, and the tool runs. A `.catch` that returns `{ deny }` makes it fail closed. A module that does not load has no `.catch`.                                                                                                           |
| Time budget    | 10 s of the hook's own time. Time spent in `next` or in a `$` call does not count.                                                                                                                                                                                                                     |
| Loading        | `--plugin-dir`, or `CLAUDE_CODE_PLUGIN_DIRS` (several paths, separated by `:`). `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of a settings file loads the mod. Tested live with `--settings`. An interactive session reloads a changed file with no restart.                                           |
| Order          | Managed settings hooks run first, then hooks modules, then the other settings hooks.                                                                                                                                                                                                                   |
| Tests          | `claude plugin test` runs without file, network, or process access. A hook that reads its rules file cannot run there.                                                                                                                                                                                 |
| Types          | The engine writes its types to `.claude-plugin/types/` when it loads a mod from a folder the user owns. A `claude -p` run did not write them.                                                                                                                                                          |

### pi and omp

| Topic                   | pi 1.1.0                                                                                                                                                  | omp 18.10.3                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime                 | Node with jiti                                                                                                                                            | Bun                                                                                                                                                                                        |
| Block a call            | `tool_call` returns `{ block: true, reason }`. A handler that throws blocks the call. Tested live.                                                        | Same API. Tested live.                                                                                                                                                                     |
| Feedback after a call   | `tool_result` returns `{ content, isError }`                                                                                                              | Same API                                                                                                                                                                                   |
| Continue after a stop   | `turn_end` or `agent_before_settle` returns `{ continue: true }`                                                                                          | Same API                                                                                                                                                                                   |
| Load from a link        | Fails: `Cannot find module './core.ts'`, resolved from the link's folder. Tested live.                                                                    | Not tested, because the pi result already rules links out.                                                                                                                                 |
| Load from the real path | Works with `-e <path>`. Tested live.                                                                                                                      | Works with `--hook=<path>`. Tested live.                                                                                                                                                   |
| Settings entry          | `extensions` in `~/.pi/agent/settings.json`, a `string[]` of files or folders. The docs say `~` works. `dot_pi/agent/modify_settings.json` owns the file. | `extensions` in `~/.omp/agent/config.yml`. An entry with a `~` path loaded and blocked. Tested live, then the file was restored. `dot_omp/private_agent/private_config.yml` owns the file. |
| Session variables       | `PI_CODING_AGENT=true` and `AI_AGENT=pi`, set at start-up                                                                                                 | `OMPCODE=1` and `CLAUDECODE=1`, set in the shell of the bash tool                                                                                                                          |

omp sets `CLAUDECODE=1`, so `format-staged-files` already runs for omp commits today.

### Codex

Codex 0.162.1 runs command hooks only. `dot_codex/modify_hooks.json` wires 7 hooks: both formatters, `lint-all-languages`, `lint-prose`, `block-secret-commits`, `enforce-cli-tools`, and `type-check-all-languages`.

| Topic             | Fact                                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session variables | A shell command sees `CODEX_THREAD_ID` (the session id) and `CODEX_CI=1`. `CODEX_SANDBOX` was unset with `-s danger-full-access`. Tested live.                                                                                                                                         |
| Block a call      | Exit code 2 with the reason on stderr. The binary also names a `hookSpecificOutput.permissionDecision` JSON form, and rejects stdout JSON that it does not recognize ("hook returned invalid pre-tool-use JSON output"). The Cursor JSON that `hook.sh` prints on stdout is such JSON. |
| Trust             | Codex runs a hook only after you trust its entry in `hooks.json`. A change to a command, matcher, or timeout needs new trust in the Codex TUI, on the host and in the devcontainer. `codex exec --dangerously-bypass-hook-trust` skips trust for one run.                              |
| Disabled hooks    | In this devcontainer, `~/.codex/config.toml` has `enabled = false` for both `PreToolUse` entries (`block-secret-commits` and `enforce-cli-tools`). The repo does not set this. A live turn ran `npm --version` with no block.                                                          |

Because both `PreToolUse` hooks are off, a live Codex test of `command.ts` would first have to turn one on. The spike did not change that setting.

## Capability matrix

"Mod" is the Claude Code mod, "pi" covers pi and omp, and "Codex" is the Codex command hook. "Spike" means a live test passed. "API" means the documented API covers it, with no test yet.

| Hook                       | Needs                                                      | Mod                                                         | pi                                          | Codex                                               |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| `enforce-cli-tools`        | Refuse a Bash call                                         | Spike                                                       | Spike                                       | Parity test (34 payloads)                           |
| `block-commit-attribution` | Refuse a Bash call                                         | API, same as the spike                                      | API, same as the spike                      | Not wired today                                     |
| `block-secret-commits`     | Refuse a Bash call after a scanner run                     | Command hook (Q20)                                          | API: `tool_call` with `node:child_process`  | API                                                 |
| `format-all-languages`     | Run prettier after a write or a Bash call, read `mtime`    | API: `tool.call` after `next`, `$.process.run`, `$.fs.stat` | API: `tool_result`                          | API, through `apply-patch.ts`                       |
| `format-org-tables`        | Run `emacs --batch` after a write or a Bash call           | API, same as above                                          | API                                         | API, through `apply-patch.ts`                       |
| `lint-all-languages`       | Send lint errors to the model after a write or a Bash call | Spike 2: `context` on the `tool.call` result                | Spike 2: `tool_result` with `isError`       | Parity test: `test.sh` and one file for each linter |
| `lint-prose`               | Send Vale errors to the model after a write                | API, same as spike 2                                        | API, same as spike 2                        | API, through `apply-patch.ts`                       |
| `type-check-all-languages` | Block a stop once per turn                                 | API: `classic.Stop` `{ block }` with `stop_hook_active`     | API: `turn_end` `{ continue }` with a guard | API                                                 |
| `track-session-changes`    | Log changed files, with git blobs                          | Needs a rewrite of the core, see below                      | Works today                                 | Works today                                         |

## Spike: enforce-cli-tools

### Files

The spike is on branch `worktree-hooks-mods-spike`, in [`dot_claude/hooks/enforce-cli-tools/`](../dot_claude/hooks/enforce-cli-tools/). It adds these files next to the unchanged `hook.sh`, `rules`, and `test/test.sh`:

| File                                                | Role                                                                                             | Lines |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| `core.ts`                                           | Pure matcher and block message. No I/O.                                                          | 156   |
| `hooks/register.ts`                                 | Mod adapter: `tool.call` on Bash, reads through `$`                                              | 26    |
| `pi.ts`                                             | pi and omp adapter: `tool_call` on bash                                                          | 26    |
| `command.ts`                                        | Command adapter for Codex: stdin to exit code 2                                                  | 27    |
| `io.ts`                                             | Node reads of the rules file, the allowlist file, and the variable, for `pi.ts` and `command.ts` | 29    |
| `dot_claude-plugin/plugin.json`, `hooks/hooks.json` | Plugin manifest and module list                                                                  | 8     |
| `test/check.ts`                                     | The `test.sh` cases against the core, and 6 adapter cases                                        | 197   |

Nothing is wired yet: `settings.json.tmpl`, `dot_codex/modify_hooks.json`, and the pi and omp settings still run `hook.sh`. The wiring is part of the cutover commit after review.

### Pass checks (Q19)

| #   | Check                                                                        | Result                                                                                                                                   |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The mod `{ deny }` reaches the model, and the next turn uses the replacement | Pass. In `claude -p` with Haiku, `cowsay hello` was denied with the full message, and the model ran `echo hello`.                        |
| 2   | pi and omp `{ block, reason }` do the same                                   | Pass for both, with the default models of each agent.                                                                                    |
| 3   | Codex blocks through the command adapter                                     | Partial. `command.ts` gives the same exit code and stderr as `hook.sh` on 34 payloads. The live test could not run, see [Codex](#codex). |
| 4   | `hooks/register.ts` loads with an import of `../core.ts`                     | Pass, in `claude plugin validate` and in a live session.                                                                                 |
| 5   | pi and omp load the extension through a link                                 | Fail for pi. Replaced by the `extensions` setting of each agent, which passed live in pi and omp.                                        |
| 6   | The time for each call is not more than the bash hook                        | Fail for the command path, see below. The mod runs in process. Its time was not measured.                                                |
| 7   | The current bash tests pass against the new code                             | Pass. All `test.sh` cases pass in `test/check.ts`, and `test.sh` still passes against `hook.sh`.                                         |

The live tests gave the mod a scratch `rules` file that bans only `cowsay`. The bash hook that runs in the same session bans only `npm` and `yarn`, so it did not affect the result.

### Time for each call

Median of 20 runs on Linux, after one run that fills the Node compile cache:

| Command              | `hook.sh` | `command.ts` |
| -------------------- | --------- | ------------ |
| `git status` (clean) | 1.5 ms    | 17.6 ms      |
| `npm i` (blocked)    | 4.1 ms    | 18.2 ms      |

The extra 16 ms is Node start-up. After the cutover only Codex uses this path. The bash hook's README gives its clean path as 1.2 ms, so these runs are 0.3 ms slower on the same path.

### Port bug found

Bash `${CLAUDE_PROJECT_DIR:-$PWD}` falls back when the variable is empty. The first port used `??`, which falls back only when the variable is unset. `test/check.ts` found it, and `command.ts` now uses `||`.

## Spike 2: lint-all-languages

### Files

The spike adds these files to [`dot_claude/hooks/lint-all-languages/`](../dot_claude/hooks/lint-all-languages/), next to the unchanged `hook.sh`, `config/`, and `test/test.sh`:

| File                                                | Role                                                                                                     | Lines |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----- |
| `core.ts`                                           | Finds the changed files and lints each by extension. Gets an `Io` object with `stat`, `read`, and `run`. | 156   |
| `hooks/register.ts`                                 | Mod adapter: `tool.call` on Write, Edit, and Bash. Lints after `next` and adds the output as `context`.  | 56    |
| `pi.ts`                                             | pi and omp adapter: `tool_result` on write, edit, and bash. Appends the output and sets `isError`.       | 52    |
| `command.ts`                                        | Command adapter for Codex: stdin to exit code 2                                                          | 31    |
| `io.ts`                                             | `Io` and settings under Node, for `pi.ts` and `command.ts`                                               | 46    |
| `dot_claude-plugin/plugin.json`, `hooks/hooks.json` | Plugin manifest and module list                                                                          | 8     |
| `test/check.ts`                                     | The core with stub I/O, the `test.sh` cases through `command.ts`, and both adapters                      | 368   |

### Results

| Check                                     | Result                                                                                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude plugin validate`                  | Pass. It lists `$.env.get`, `$.fs.read`, `$.fs.stat`, `$.process.run`, and `$.session.cwd`.                                                                                                                             |
| Feedback reaches the model in Claude Code | Pass. After a Write of a shell file with SC2154, the model read "tool.call hook additional context: Lint errors in the files this call changed. Fix them: …", then fixed the file. `classic.PostToolUse` is not needed. |
| Feedback reaches the model in pi and omp  | Pass for both. The model quoted the SC2154 warning from the write result and fixed the file.                                                                                                                            |
| Parity with `hook.sh`                     | Pass. The 11 cases of `test.sh` pass against both hooks. A broken file for each of the 6 linters gives the same exit code and output, except for random temp names and a Python `ResourceWarning`.                      |
| `$.process.run` finds the linters         | Pass. It found `shellcheck` on `PATH`. The docs say the child gets the host environment, with `env` set over it.                                                                                                        |
| Time of the mod hook                      | Not measured. The debug log gives 105 to 581 ms for the whole `tool.call` chain: the tool, this mod, and two other mods.                                                                                                |

The live Claude Code test set `CLAUDE_LINT_DISABLE=sh`, so the bash hook in the same session skipped shell files. The scratch copy of the mod read another variable name, so it still linted them.

One output difference has no effect in Claude Code. When every linter passes but one prints a warning, `hook.sh` writes the warning to stderr and exits 0, and `command.ts` writes nothing. Claude Code does not show stderr on exit 0. Codex was not checked.

## Approved behavior changes

Q5 requires approval by name. You approved these changes on 2026-10-18:

| Change                                                                                              | Reason                                                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Drop the Cursor output: the `{"permission": ...}` line on stdout, and the `.command` payload field. | Nothing in the repo wires a hook for Cursor.                               |
| Drop the substring pre-filter.                                                                      | It saved a `jq` process in bash. The TypeScript matcher starts no process. |
| Drop the `jq` dependency.                                                                           | Node parses the payload.                                                   |
| The Codex call takes 18 ms instead of 1.5 ms.                                                       | Node start-up, see above.                                                  |

## Decisions for each hook

| Hook                       | Claude Code          | pi and omp | Codex        | Note                                                       |
| -------------------------- | -------------------- | ---------- | ------------ | ---------------------------------------------------------- |
| `enforce-cli-tools`        | Mod                  | `pi.ts`    | `command.ts` | Spike done                                                 |
| `block-commit-attribution` | Mod                  | `pi.ts`    | None         | Same shape as the spike                                    |
| `block-secret-commits`     | `command.ts` (Q20)   | `pi.ts`    | `command.ts` | Fails closed. In pi, a handler that throws already blocks. |
| `format-all-languages`     | Mod                  | `pi.ts`    | `command.ts` | Verify `$.process.run` with prettier                       |
| `format-org-tables`        | Mod                  | `pi.ts`    | `command.ts` | Verify `$.process.run` with emacs                          |
| `lint-all-languages`       | Mod                  | `pi.ts`    | `command.ts` | Spike 2 done: `context` on the `tool.call` result          |
| `lint-prose`               | Mod                  | `pi.ts`    | `command.ts` | Same shape as spike 2                                      |
| `type-check-all-languages` | Mod (`classic.Stop`) | `pi.ts`    | `command.ts` | Test the `continue` guard in pi                            |
| `track-session-changes`    | Mod                  | `pi.ts`    | `command.ts` | Async rewrite of the core, see below                       |
| `format-staged-files`      | Not an agent hook    |            |              | Moves to `dot_config/git/hooks/`                           |

### track-session-changes

`track-session-changes/core.ts` imports six Node modules and makes 49 synchronous file, process, and zlib calls. A mod has no Node and no synchronous I/O. You chose on 2026-10-18 to rewrite the core as async code over passed-in functions, so that Claude Code runs it as a mod. The other option was to keep the current `node hook.ts` command hook.

The rewrite has these consequences:

- The pi adapter and the Codex adapter call the same async core. The current `hook.ts` becomes `command.ts`.
- The mod must write git blobs without `node:zlib` and `node:crypto`. The environment has web APIs (`crypto.subtle`, and possibly `CompressionStream`), or the core can run `git hash-object -w` through `run(argv)`. The design doc picks one after a test.
- It is the largest port, so it stays last in the cutover order (Q14).

## Changes to the plan

These changes follow from the facts above. The design doc uses them.

1. **Load `pi.ts` through settings, not links.** Add `~/.claude/hooks/<hook>/pi.ts` to `extensions` in `dot_pi/agent/modify_settings.json`, and to `extensions` in the omp config. To turn a hook off, remove its line. This replaces the links of Q17.
2. **Adapters read the variables; cores get values or small functions.** Each adapter reads the environment variables its hook needs, by literal name, and passes the values. A core that only matches text, such as `enforce-cli-tools`, gets values and is pure. A core that must run a program and then decide, such as `lint-all-languages`, gets an `Io` object with `stat`, `read`, and `run`, which the mod adapter writes out with `$.fs` and `$.process` calls inside it. `claude plugin validate` accepts this.
3. **Keep the `hooks/` folder.** A `"hooks"` field in `plugin.json` can name a file at the plugin root, but you chose on 2026-10-18 to keep the documented default: `hooks/hooks.json` and `hooks/register.ts` in each hook folder.
4. **Type-check against the installed types, not a copy in the repo.** Claude Code writes its types beside each mod that a session loads from `CLAUDE_CODE_PLUGIN_DIRS`, in `~/.claude/hooks/<hook>/.claude-plugin/types/`, also under `claude -p`. [`scripts/extensions/hooks/check.sh`](../scripts/extensions/hooks/check.sh) extends the `tsconfig.json` in that folder for the mods, and uses the pi types for `pi.ts` and `command.ts`. It also runs `claude plugin validate` on a copy of each mod, which finds a `$` call that `tsc` accepts and the engine refuses. A copy of the types in the repo would need an update after each Claude Code release.

## Open items

For the design doc:

- The time of a mod hook alone. The debug log gives one time for the whole `tool.call` chain only.
- The minimum Claude Code version. The spike used 2.1.302. `claude plugin validate` names 2.1.275 for one-step marketplace installs, which this repo does not use.
- Whether the two Codex `PreToolUse` hooks stay off. If they go on again, the cutover must trust and enable the new `command.ts` entries in the Codex TUI, and one live Codex turn must confirm the block.
