# enforce-cli-tools research

This file holds the cost measurements of the hook. For what the hook does and how to use it, see the [README](../README.md).

## Time per call

| Agent       | Cost of a call                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | The mod runs in the Claude Code process and starts no program. It reads `rules` and the allowlist file on each Bash call.    |
| pi and omp  | The extension runs in the agent process.                                                                                     |
| Codex       | `command.ts` starts Node: about 18 ms for each Bash call, against 1.5 ms for the old bash hook (median of 20 runs on Linux). |

[`docs/hooks/performance.md`](../../../../docs/hooks/performance.md) has a later measurement of all hooks, on macOS.

## Tokens per call

A clean command costs **zero tokens**. A block costs the message plus the turn that produced the rejected command. Both the rejected call and the message stay in the transcript.

The message is about 360 characters, plus the repo path twice. For a repo path of 56 characters, the message is 470 characters: about 120 tokens, at 4 characters for each token.

## Block or rewrite

A silent rewrite of the command would cost no tokens, but the model would never learn the rule and would keep reaching for `npm`. The block teaches the rule, and the line in `rules/tools.md` keeps blocks rare.
