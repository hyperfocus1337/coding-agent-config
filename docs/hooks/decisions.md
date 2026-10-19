# Hook decisions

Why the hooks are built as [`README.md`](README.md) and [`authoring.md`](authoring.md) describe. Each entry gives the decision, the reason, and the cost. You took each decision on 2026-10-18 or 2026-10-19, when the hooks moved from bash to TypeScript.

## One core for 4 agents

**Decision:** each hook has one copy of its logic, which Claude Code, pi, omp, and Codex use. **Why:** before the move, pi and omp ran only `track-session-changes`, through a separate extension, and a fix to one copy did not reach the other. **Cost:** each hook has 3 adapters to keep in step with 3 hook APIs.

## A mod where the mod API covers the hook, else a command hook

**Decision:** the Claude Code adapter is a mod when the mod API can do what the hook needs. Else it is `command.ts` as a command hook. **Why:** a mod runs in process and starts no Node, about 18 ms less for each call. **Cost:** the mod API is in early access and can change with no notice.

## No shared library between hooks

**Decision:** each hook folder imports nothing outside it. There is no shared `lib/` folder. **Why:** you can deploy, load, test, or turn off one hook alone. **Cost:** some small I/O functions exist in more than one `io.ts`.

## Adapters read the environment, cores get values

**Decision:** each adapter reads the environment variables of its hook and passes values or an `Io` object to the core. **Why:** a mod must spell each `$` call with a literal name at the call site, so a core that takes `$` does not validate. A core with no I/O is also easy to test with stubs.

## Mods load through `CLAUDE_CODE_PLUGIN_DIRS`

**Decision:** the `env` block of `settings.json.tmpl` sets `CLAUDE_CODE_PLUGIN_DIRS` to the list of mod folders. **Why:** it needs no marketplace and no install step. chezmoi deploys the folder, and the next session loads it. Each folder keeps the default `hooks/hooks.json` and `hooks/register.ts`, not a `"hooks"` field in `plugin.json`.

## pi and omp load `pi.ts` through the `extensions` setting

**Decision:** `extensions` in the settings of pi and omp names `~/.claude/hooks/<hook>/pi.ts`. **Why:** pi resolves the imports of a linked file from the folder of the link, so an extension link to a hook folder fails with `Cannot find module './core.ts'`. To turn a hook off, remove its line.

## block-secret-commits is a command hook in Claude Code

**Decision:** Claude Code runs `command.ts` through `guard.sh`, not a mod. **Why:** the binary scan copies each new binary file to a temporary folder, and `$.fs` has no copy, no remove, and no binary write, and refuses a file over 4 MiB. Review this when the mod API leaves early access.

## type-check-tsc and type-check-pyrefly are command hooks in Claude Code

**Decision:** the `Stop` entries in `settings.json.tmpl` run the `command.ts` of each hook. **Why:** a mod on `classic.Stop` loaded but did not run, because `cc-plugin-sec-default` skips user mods on `classic.*` events for a Team organization. In pi and omp, `agent_end` sends the errors with `pi.sendMessage` and `triggerTurn`, because omp has no `agent_before_settle`.

## One hook for each type checker

**Decision:** `type-check-tsc` and `type-check-pyrefly` replace `type-check-all-languages`. Each hook has its own copy of the git lookup, `io.ts`, and the adapters. **Why:** the name tells which checker runs, you turn off one checker by removing one entry, and each checker gets its own 60 s limit. The two checkers shared only the changed-file lookup, about 15 lines. **Cost:** about 100 lines that are the same in both hooks and must stay the same by hand. A shared module was rejected because no hook imports from another hook. **Why not Python for pyrefly:** a Python hook can only be a command hook, so pi and omp would lose the check, and the hooks would need a second runtime. [`hook-alternatives.md`](../research/hooks/hook-alternatives.md) found no official hook that replaces either one.

## Each hook name says what it covers

**Decision:** `format-prettier` replaces `format-all-languages`, and `lint-code` replaces `lint-all-languages` and stays one hook. **Why:** neither hook covered all languages. Prettier formats only its own languages, not Python, shell, or Terraform. The lint hook runs 5 tools on Python, JS/TS, shell, and YAML, so a name after one tool does not fit, and `lint-code` pairs with `lint-prose`. A split by language would make about 4 copies of the adapters and the test setup, as the type-check split did. **Cost:** a rename changes the Codex hook entries, so you must trust them again in the Codex TUI.

## terraform fmt runs in a format hook, not in the lint hook

**Decision:** `format-terraform` runs `terraform fmt` on each changed `.tf` and `.tfvars` file, and `lint-code` no longer checks Terraform. **Why:** `terraform fmt` is a formatter. As `terraform fmt -check -diff` in the lint hook, it blocked the call and the model fixed the spaces by hand, which cost a turn. As a format hook, it fixes the file and the model gets no message, as with `format-prettier` and `format-org-tables`. **Cost:** a new hook folder with its own adapters and test, about 300 lines that copy `format-org-tables`. Nothing reports a Terraform file that does not parse: `terraform validate` and tflint check a whole module, not one file.

## track-session-changes runs as a mod

**Decision:** the core is async over an `Io` object, so that Claude Code runs it as a mod. The other option was to keep `node hook.ts` as a command hook. **Why:** the mod took 9 to 30 ms for each side of a Bash call, against 27 to 57 ms for the command hook. **Cost:** the mod runs `git hash-object`, `ln`, `cp -p`, `mv`, `rm -rf`, and `sh -c 'cat >>'` for what `$.fs` cannot do. See [`track-session-changes/docs/implementation.md`](../../dot_claude/hooks/track-session-changes/docs/implementation.md).

## Messages for the user go to a notification

**Decision:** a message that is for the user and not for the model, such as a Vale failure in `lint-prose`, goes to `$.ui.notify` in the mod and `ctx.ui.notify` in pi. Codex keeps stderr. **Why:** a mod and a pi extension have no channel like the exit 1 stderr of a command hook. The model does not get text that it cannot fix.

## A missing node gives one warning for each session

**Decision:** each command entry starts with `command -v node >/dev/null || exit 0`, and a `SessionStart` entry in Claude Code and Codex prints a `systemMessage` when `node` cannot run a `.ts` file. **Why:** a hook that exits 0 with no `node` gives no sign, and a check for each call gives a warning for each call. `block-secret-commits` is the exception: its `guard.sh` blocks each `git commit` with no `node`.

## Codex PreToolUse hooks are on

**Decision:** `dot_codex/modify_private_config.toml` removes `enabled = false` from each `pre_tool_use` entry in `hooks.state` at each apply. **Why:** `block-secret-commits` and `enforce-cli-tools` must also run in Codex. **Cost:** the repo does not write `trusted_hash`, so you trust each changed entry once in the Codex TUI.

## The move added no hook to Codex

**Decision:** Codex runs the hooks it ran before the move. `block-commit-attribution` did not run in Codex, so it does not run there now. **Why:** the move changed the language of each hook and kept its behavior. A new Codex hook is a separate change.

## format-staged-files runs for each agent

**Decision:** the git `pre-commit` hook moved to `dot_config/git/hooks/format-staged-files/` and runs when any agent variable is set: `CLAUDECODE=1`, `PI_CODING_AGENT=true`, `OMPCODE=1`, or `CODEX_THREAD_ID`. **Why:** before, only `CLAUDECODE=1` counted, so pi and Codex commits were not formatted. **Cost:** about 18 ms for each file and formatter, about 180 ms for a commit of 5 files.

## Behavior that the move dropped

| Change                                                                                     | Reason                                                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| No Cursor output: no `{"permission": ...}` line on stdout, and no `.command` payload field | Nothing wires a hook for Cursor, and Codex reports unknown stdout as a failed hook |
| No substring pre-filter before the match                                                   | It saved a `jq` process in bash. The TypeScript matcher starts no process.         |
| No `jq` dependency                                                                         | Node parses the payload                                                            |
| A Codex call costs about 18 ms, not the 1.5 ms of the bash hook                            | Node start-up                                                                      |

## Old files leave through `.chezmoiremove`

**Decision:** `.chezmoiremove` lists each file that chezmoi deployed before and that the repo no longer has, such as the old `hook.sh` files. **Why:** `just chezmoi` then removes them on the host and in the devcontainer, with no manual step on each machine.
