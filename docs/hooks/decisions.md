# Hook decisions

Why the hooks are built as [`README.md`](README.md) and [`authoring.md`](authoring.md) describe. Each entry gives the decision, the reason, and the cost. You took each decision on 2026-10-18 or 2026-10-19, when the hooks moved from bash to TypeScript.

## One core for 4 agents

**Decision:** each hook has one copy of its logic, which Claude Code, pi, omp, and Codex use. **Why:** before the move, pi and omp ran only `track-session-changes`, through a separate extension, and a fix to one copy did not reach the other. **Cost:** each hook has 3 adapters to keep in step with 3 hook APIs.

## A mod where the mod API covers the hook, else a command hook

**Decision:** the Claude Code adapter is a mod when the mod API can do what the hook needs. Else it is `command.ts` as a command hook. **Why:** a mod runs in process and starts no Node, about 18 ms less for each call. **Cost:** the mod API is in early access and can change with no notice.

## No shared library between hooks

**Decision:** each hook folder imports nothing outside it. There is no shared `lib/` folder. **Why:** you can deploy, load, test, or turn off one hook alone. **Cost:** some small I/O functions exist in more than one `io.ts`. One exception: `format-prettier` and `format-oxfmt` each hold a copy of `shared.ts` and `omp.ts`, see [format-oxfmt is a second hook](#format-oxfmt-is-a-second-hook-with-one-switch).

## Adapters read the environment, cores get values

**Decision:** each adapter reads the environment variables of its hook and passes values or an `Io` object to the core. **Why:** a mod must spell each `$` call with a literal name at the call site, so a core that takes `$` does not validate. A core with no I/O is also easy to test with stubs.

## Mods load through `CLAUDE_CODE_PLUGIN_DIRS`

**Decision:** the `env` block of `settings.json.tmpl` sets `CLAUDE_CODE_PLUGIN_DIRS` to the list of mod folders. **Why:** it needs no marketplace and no install step. chezmoi deploys the folder, and the next session loads it. Each folder keeps the default `hooks/hooks.json` and `hooks/register.ts`, not a `"hooks"` field in `plugin.json`.

## pi and omp load their files through the `extensions` setting

**Decision:** `extensions` in the settings of pi and omp names `~/.claude/hooks/<hook>/pi.ts`, and in omp also `omp.ts`. **Why:** pi resolves the imports of a linked file from the folder of the link, so an extension link to a hook folder fails with `Cannot find module './core.ts'`. To turn a hook off, remove its lines.

## omp code goes in `omp.ts`

**Decision:** code that omp needs and pi does not goes in the `omp.ts` of the hook, which imports the shared code from `pi.ts`, by the rules in [`authoring.md`](authoring.md#omp-code). omp loads `omp.ts` after `pi.ts` when it adds to it, and in place of `pi.ts` when the `pi.ts` handler must not run in omp. **Why:** you can see and track the omp fixes apart from the pi code, with `fd omp.ts` and the git log of the `omp.ts` files, and no code exists twice in one hook. **Cost:** omp loads up to 2 files for each hook, and each `omp.ts` declares the omp-only event types it reads, because no omp types are installed. The omp call parsing of the 4 format and lint hooks exists in each of their `omp.ts` files, as [No shared library between hooks](#no-shared-library-between-hooks) allows.

## block-secret-commits is a command hook in Claude Code

**Decision:** Claude Code runs `command.ts` through `guard.sh`, not a mod. **Why:** the binary scan copies each new binary file to a temporary folder, and `$.fs` has no copy, no remove, and no binary write, and refuses a file over 4 MiB. Review this when the mod API leaves early access.

## type-check-tsc and type-check-pyrefly are command hooks in Claude Code

**Decision:** the `Stop` entries in `settings.json.tmpl` run the `command.ts` of each hook. **Why:** a mod on `classic.Stop` loaded but did not run, because `cc-plugin-sec-default` skips user mods on `classic.*` events for a Team organization. In pi, `agent_end` sends the errors with `pi.sendMessage` and `triggerTurn`, and pi waits for `agent_end` to finish. omp does not wait for `agent_end`, so `omp.ts` returns the errors from `session_stop`, which omp waits for.

## One hook for each type checker

**Decision:** `type-check-tsc` and `type-check-pyrefly` replace `type-check-all-languages`. Each hook has its own copy of the git lookup, `io.ts`, and the adapters. **Why:** the name tells which checker runs, you turn off one checker by removing one entry, and each checker gets its own 60 s limit. The two checkers shared only the changed-file lookup, about 15 lines. **Cost:** about 100 lines that are the same in both hooks. `just hooks-check` keeps them the same: it fails when the code files of the two hooks differ in a way that [`type-check.diff`](../../scripts/extensions/hooks/type-check.diff) does not record. A shared module was rejected because no hook imports from another hook. **Why not Python for pyrefly:** a Python hook can only be a command hook, so pi and omp would lose the check, and the hooks would need a second runtime. [`hook-alternatives.md`](../research/hooks/hook-alternatives.md) found no official hook that replaces either one.

## Each hook name says what it covers

**Decision:** `format-prettier` replaces `format-all-languages`, and `lint-code` replaces `lint-all-languages` and stays one hook. **Why:** neither hook covered all languages. Prettier formats only its own languages, not Python, shell, or Terraform. The lint hook runs 5 tools on Python, JS/TS, shell, and YAML, so a name after one tool does not fit, and `lint-code` pairs with `lint-prose`. A split by language would make about 4 copies of the adapters and the test setup, as the type-check split did. **Cost:** a rename changes the Codex hook entries, so you must trust them again in the Codex TUI.

## terraform fmt runs in a format hook, not in the lint hook

**Decision:** `format-terraform`, now [`format-code`](#format-code-holds-the-formatters-that-are-not-prettier), runs `terraform fmt` on each changed `.tf` and `.tfvars` file, and `lint-code` no longer checks Terraform. **Why:** `terraform fmt` is a formatter. As `terraform fmt -check -diff` in the lint hook, it blocked the call and the model fixed the spaces by hand, which cost a turn. As a format hook, it fixes the file and the model gets no message, as with `format-prettier` and `format-org-tables`. **Cost:** a new hook folder with its own adapters and test, about 300 lines that copy `format-org-tables`. Nothing reports a Terraform file that does not parse: `terraform validate` and tflint check a whole module, not one file.

## tflint runs in the lint hook

**Decision:** on 2026-10-21, `lint-code` runs tflint on each changed `.tf` file, in the folder of the file, with `--filter=<file>`. **Why:** tflint finds errors that `terraform fmt` does not, such as an unknown AWS instance type, and it reports a file that does not parse. The [entry above](#terraform-fmt-runs-in-a-format-hook-not-in-the-lint-hook) rejected tflint because it checks a whole module, but `--filter` keeps the issues of one file. **Cost:** about 200 ms for each `.tf` edit with the `aws` and `azurerm` plugins. Each machine needs `tflint --init` once, and a plugin that is not installed makes the hook skip Terraform files with no message.

## format-code holds the formatters that are not Prettier

**Decision:** on 2026-10-21, `format-terraform` became `format-code`, with a table of formatters in `core.ts`: `terraform fmt` for `.tf` and `.tfvars`, and shfmt for `.sh` and `.bash`. **Why:** each formatter runs one command on one file and prints the name of a changed file, so a new formatter is one row and not a new folder with about 300 lines of adapters and test, as [`lint-code`](#each-hook-name-says-what-it-covers) does for linters. **Cost:** a formatter has no session toggle of its own, only a [repository key](#advisory-hooks-also-turn-off-per-repository-through-git-config). The rename changes the Codex hook entries, so you trust them again in the Codex TUI. `format-prettier` and `format-org-tables` stay apart, because each finds the files of a Bash call in its own way.

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

## Advisory hooks turn off through one environment variable

**Decision:** `/toggle-hook` sets `AGENT_HOOKS_DISABLE` in the agent process, and each advisory hook reads it on each run. **Why:** a mod can change the environment of Claude Code with `$.env.set`, and an extension can change `process.env` of pi and omp. One variable then reaches the mods, the extensions, and the command hooks, with no state shared between hook folders. A setting in `settings.json` would drift from chezmoi, and stay on after the session. **Cost:** Codex has no extension commands, so it gets the variable at launch only. The guards have no toggle, so that a command cannot turn one off.

**Name:** until 2026-10-21 the variable was `CLAUDE_HOOKS_DISABLE`. It got the `AGENT_` prefix of `AGENT_ALLOW_*`, because 4 agents read it. The hooks no longer read the old name.

## Advisory hooks also turn off per repository through git config

**Decision:** on 2026-10-21, `/toggle-hook --repo <hook>` writes `agent-hook.<hook>.enabled false` to `.git/config` of the session repository, and `--repo format-code.shfmt` writes `agent-hook.format-code.shfmt false`. Each advisory hook reads the key with `git config --type=bool --get` in the repository of each file, and does nothing when the key or the session variable turns it off. `format-staged-files` obeys the key, but not the session variable. The dcg pack `local.agent_hook` blocks an agent command that writes a key.

**Why:** a formatter that fights the style of a client repository is a fact about that repository, not about one session, and the variable is lost when you quit. The key is not committed, so a client repository gets no new file. The shape copies `hook.<name>.enabled` of git, and leaves room for one key for each formatter. Codex gets the key also, through `git config` in your terminal.

**Cost:** each hook starts one git process for each folder of the files it keeps, about 1 ms, and only after its cheap checks. A model can still change `.git/config` with a tool that is not Bash.

**Rejected:** a session toggle that turns on a hook that the repository turns off. It would need a second variable. The command tells you to use `--repo` instead.

## format-oxfmt is a second hook, with one switch

**Decision:** on 2026-10-23, [`format-oxfmt`](../../dot_claude/hooks/format-oxfmt/README.md) formats the files of `format-prettier` with oxfmt, as a second hook:

- It is off until `agent-hook.format-oxfmt.enabled` is `true`, in the repository or globally. Then `format-prettier` formats nothing for the same call.
- Both hooks read the key once for each call, in the session folder.
- `/toggle-hook --global` writes the key to `~/.gitconfig`.
- The two hooks share the sweep, the switch, and the amend hint in `shared.ts`, as a copy in each folder. The `format-oxfmt` check fails when the copies differ.

**Why:** oxfmt is faster and formats more file types, but it does not read `.prettierrc`, its Markdown formatter is new, and it releases each week. A separate hook lets you try it and switch back with one key, and `format-prettier` stays as it is until oxfmt replaces it. One key for both hooks means that two formatters never format one file. A Claude Code mod imports only files inside its own plugin, so a shared file outside the folders does not load. See [`oxfmt-and-prettier-alternatives.md`](../research/formatting/oxfmt-and-prettier-alternatives.md).

**Cost:** `format-prettier` starts one more `git config` for each call. A file in a second repository follows the switch of the session folder. A file with no oxfmt config gets the bundled config, not the `.prettierrc` of its project. A fix to `shared.ts` goes in both copies.

**Rejected:** oxfmt in `format-prettier`, as in the migration plan of the research: you cannot switch back with no code change. A switch for each file: both hooks would then sweep each Bash call. A choice by the presence of `.oxfmtrc.json`: you cannot try oxfmt in a repository without a new file in it.

## Behavior that the move dropped

| Change                                                                                     | Reason                                                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| No Cursor output: no `{"permission": ...}` line on stdout, and no `.command` payload field | Nothing wires a hook for Cursor, and Codex reports unknown stdout as a failed hook |
| No substring pre-filter before the match                                                   | It saved a `jq` process in bash. The TypeScript matcher starts no process.         |
| No `jq` dependency                                                                         | Node parses the payload                                                            |
| A Codex call costs about 18 ms, not the 1.5 ms of the bash hook                            | Node start-up                                                                      |

## Old files leave through `.chezmoiremove`

**Decision:** `.chezmoiremove` lists each file that chezmoi deployed before and that the repo no longer has, such as the old `hook.sh` files. **Why:** `just chezmoi` then removes them on the host and in the devcontainer, with no manual step on each machine.
