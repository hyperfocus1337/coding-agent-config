# enforce-cli-tools

A `PreToolUse` hook that blocks shell commands which run a banned CLI tool and tells Claude which tool to use instead. It ships with `npm → pnpm` and `yarn → pnpm`, but the mapping is data, not code: adding an enforcement is a one-line edit in [`rules`](rules).

## How it works

The hook is wired to the `Bash` tool in `settings.json`, so it runs before every shell command. It reads the command out of the payload with `jq`, tokenises it, and blocks with exit code 2 if a banned tool is the thing actually being run. Anything else exits 0 immediately.

Matching is **command-position only**, never a substring or word-boundary search over the whole command. Quoted spans are blanked out first, so a separator inside a string cannot be mistaken for one between commands. What is left is split into segments on `&`, `|`, `;`, newlines, and the brackets that open a subshell, a group or a substitution: whatever runs inside `$(...)`, backticks or `{ ...; }` is a command in its own right and is checked as its own segment, wherever it sits in the line. In each segment the hook steps over `VAR=value` assignments and the usual wrappers (`sudo`, `env`, `command`, `builtin`, `exec`, `nohup`, `time`, `timeout`, `nice`, `stdbuf`, `xargs`) plus, once a wrapper has been seen, that wrapper's own flags and their values. It then strips any leading path from the next token and compares it against the rules. So these block:

```sh
npm i                  # plain invocation
sudo npm ci            # wrapper skipped
CI=1 npm run build     # env assignment skipped
timeout 30 npm ci      # wrapper argument skipped too
/usr/local/bin/npm i   # path stripped
cd web && yarn add x   # second segment
cd web
npm i                  # second line
(cd web && npm i)      # subshell
{ npm i; }             # group
echo $(npm bin)        # substitution, even as an argument
```

and these do not, because the banned name is never in command position:

```sh
rg npm
git commit -m "switch to npm"
git commit -m "fix; npm bump"   # separator inside a quoted string
echo "a && npm i"
cat package-lock.json
npmrc-check
```

Two gaps remain, both failing open. Heredoc bodies are still split naively, so a separator on a line of heredoc text can start a bogus segment; the overrides below clear that one. And blanking quoted spans means a banned tool hidden inside one is invisible, so `sh -c 'npm i'` passes. Neither is worth a real shell-word parser yet, which is the upgrade path for both.

Only the **first** violation is reported. One clear message beats a list, and fixing it re-runs the hook anyway.

## Cost per command

This runs ahead of every Bash tool call, so the clean path is kept fork-free. The rules are parsed once at script load, and before anything else the raw payload is scanned for each banned name as a plain substring. If none appears, the hook allows and exits without spawning `jq` or any subshell, which is the case for almost every command.

The substring is deliberately loose, so `pnpm i` and a `npm` inside a commit message both reach `jq` and are then correctly allowed by the real matcher. A word-boundary test was tried and was wrong: the pre-filter sees the payload as raw JSON, so a command like `cd x` followed by `npm i` on the next line carries a `\n` escape whose `n` sits directly in front of the word, and the rule silently stopped applying. Over-matching costs one `jq` fork on the rare command that mentions a banned name; under-matching loses enforcement with no error anywhere.

### Wall clock

Measured over 200 runs per path on Linux with a full payload piped in. Nothing fires for `Read`, `Edit`, `Grep` or any other tool, only `Bash`.

| Path                                         | Cost    | Frequency  |
| -------------------------------------------- | ------- | ---------- |
| bare `bash` startup (the floor for any hook) | 0.74 ms | every call |
| clean command (`ls -la`, `git status`)       | 1.2 ms  | almost all |
| candidate: payload mentions a banned name    | 4.5 ms  | occasional |
| blocked command                              | 3.6 ms  | rare       |

So the hook's own marginal cost on the clean path is about **0.5 ms**; the rest is bash starting up, which any command-type hook pays. The candidate path is the `jq` fork. Process startup is slower on macOS, so expect the same shape with larger numbers, which is why the clean path is kept fork-free rather than tuned to a target.

### Tokens

A clean command costs **zero tokens**. Claude Code writes hook stdout to the debug log rather than the transcript on exit 0, and never shows Claude a hook's stderr, so the `{"permission":"allow"}` line is invisible to the model.

A block costs roughly **80 tokens** of stderr (the message is about 320 characters, and grows with the length of the repo path in the override hint), plus the turn spent producing the rejected command and re-emitting the corrected one. Call it a few hundred tokens for a block, against zero for everything else. Both the rejected tool call and the block message stay in the transcript for the rest of the session, so a block is paid once and then carried.

That is the trade chosen over rewriting the command silently: a rewrite would cost nothing and the model would never learn the rule, so it would keep reaching for `npm` all session. The line in `rules/cli-tools.md` is what makes blocks rare in the first place, the hook is the backstop for when the instruction is missed.

## The rules

[`rules`](rules) holds one `<banned> <replacement>` pair per line; blank lines and `#` comments are ignored:

```sh
npm	pnpm
yarn pnpm
```

Add a line to enforce another tool and nothing in `hook.sh` changes. The replacement takes the rest of the line, so multi-word replacements work: `npx	pnpm dlx` blocks `npx create-vite app` and suggests `pnpm dlx create-vite app`. The replacement is used for two things: the "use `X` instead" message, and a suggested command built by swapping the first occurrence of the banned word, so the model can retry in one turn instead of reconstructing the line.

If the rules file is missing or empty the hook allows everything, so a half-deployed config never blocks work.

## Overrides

Both escape hatches name the specific tool that stays allowed, so they never switch the whole hook off.

**1. Per-repo allowlist file.** Create `.claude-allow-cli-tools` in the repo root listing the tools this repo may use, one per line, with `#` comments and blank lines ignored:

```sh
# .claude-allow-cli-tools
npm # this client's repo is npm-only, package-lock.json is committed
```

It is persistent, survives across sessions, and because it lives in the repo you can commit it so the whole team inherits the exemption. This is the right answer for a repo that genuinely does not use pnpm.

**2. Environment variable.** Set `CLAUDE_ALLOW_CLI_TOOLS` to the tool(s) to exempt, whitespace- or colon-separated:

```sh
CLAUDE_ALLOW_CLI_TOOLS=npm:yarn
```

Best for a one-off or session-scoped skip that leaves no trace in the repo. Export it for the rest of a session, or prefix a single command.

Both are additive and tool-scoped: exempting `npm` leaves every other rule enforced.

## Why a hook and not a permissions rule

`settings.json` can already deny commands directly (`"permissions": {"deny": ["Bash(npm:*)"]}`), and its matcher is better than this one: it uses a real parser rather than a textual split. It is deliberately not used here because a deny rule can only say no. It cannot name the replacement, cannot hand back a corrected command, cannot be exempted per repo (deny always wins over allow, so there is no equivalent of `.claude-allow-cli-tools`), and Cursor does not read it at all. Those four are the whole reason this hook exists. If per-repo exemption and Cursor support ever stop mattering, a deny rule plus the line in `rules/cli-tools.md` replaces this directory.

## Dependencies

`jq` must be on `$PATH` (`brew install jq` on macOS), but only to confirm a candidate the pre-filter has already flagged: a clean command never invokes it. If it is missing, or the payload carries no command, the hook allows the command rather than blocking it.

## Editors

The hook targets both Claude Code and Cursor. Claude Code reads the block from exit code 2 and the stderr message; Cursor's `beforeShellExecution` reads stdout, which is always valid JSON (`{"permission":"allow"}` on a pass, `{"permission":"deny", "agent_message":...}` on a block). Cursor also passes the command flat rather than under `tool_input`, which the `jq` filter handles with a fallback. The deny message interpolates only the rule words, never the command, so a quote in the command cannot malform the JSON.

## Tests

`test/test.sh` is a smoke test for the `violation` matcher: it sources `hook.sh` (stopping at the sourcing guard so only the functions load) and asserts that command-position hits block, argument and text mentions pass, and an allowlisted tool is exempt while the others stay enforced. Run `bash test/test.sh`. See [test/README.md](test/README.md).

Nothing runs it automatically: the repo's only workflow publishes skills, and the `Justfile` lint and format recipes cover `scripts/` and `templates/` but not `dot_claude/`. It exits non-zero on failure, so wiring it up is a one-line recipe whenever that gap is worth closing.

## Files

- `hook.sh` is the matcher, invoked from `settings.json`. It deploys via chezmoi to `~/.claude/hooks/enforce-cli-tools/`.
- `rules` is the mapping table, read at runtime from beside `hook.sh`.
- `test/test.sh` is the matcher smoke test, run by hand (see [Tests](#tests)).
