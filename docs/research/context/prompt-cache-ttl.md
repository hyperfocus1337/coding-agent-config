# Prompt cache TTL

`settings.json` sets `env.ENABLE_PROMPT_CACHING_1H` to `"1"`, which raises the prompt cache time to live from 5 minutes to 1 hour. The setting is not a pure win: it doubles the price of every cache write. This doc records the arithmetic, the mechanism that decides how large those writes are, and the conditions under which the setting loses money.

Checked 2026-08-23 against Claude Code 2.1.241 and the Anthropic prompt caching documentation. Prices are Claude API first-party rates and can change.

## The setting

`ENABLE_PROMPT_CACHING_1H` is an environment variable, not a settings key, so it goes in the `env` block of `settings.json` rather than at the top level. Claude Code 2.1.241 lists it in the same internal flag table as `ENABLE_LSP_TOOL`, which this repo already sets the same way.

Four related variables exist in the same table:

| Variable                           | Effect                                                 |
| ---------------------------------- | ------------------------------------------------------ |
| `ENABLE_PROMPT_CACHING_1H`         | Use the 1-hour TTL on the Claude API.                  |
| `ENABLE_PROMPT_CACHING_1H_BEDROCK` | Same, for Amazon Bedrock.                              |
| `FORCE_PROMPT_CACHING_5M`          | Pin the 5-minute TTL, overriding the above.            |
| `DISABLE_PROMPT_CACHING`           | Turn caching off. Per-model variants exist per family. |

## Price

Cache prices are multipliers on the model's base input price, so they hold whatever model the session runs.

| Operation                           | Cost against the base input price |
| ----------------------------------- | --------------------------------- |
| Cache write, 5-minute TTL (default) | 1.25x                             |
| Cache write, 1-hour TTL             | 2x                                |
| Cache read, either TTL              | 0.1x                              |

## Break-even

A cache entry has to be read enough times to earn back the write premium.

| TTL       | Write + reads to break even | Cost  | Uncached equivalent |
| --------- | --------------------------- | ----- | ------------------- |
| 5 minutes | write + 1 read              | 1.35x | 2x for 2 requests   |
| 1 hour    | write + 2 reads             | 2.2x  | 3x for 3 requests   |

The 5-minute cache pays for itself on the second request. The 1-hour cache needs a third. That difference is the whole trade: 1 hour buys survival across a gap, and charges an extra read's worth of margin for it.

## What counts as a cache write

Caching is a prefix match, not a whole-prompt match. The cache key is the exact bytes of the rendered prompt up to each cache breakpoint, and a single changed byte at position N invalidates every breakpoint at or after N.

The render order is fixed: tool definitions, then the system prompt, then the messages. In a Claude Code session that means tool and MCP definitions first, then the system prompt with `CLAUDE.md` and the active rules, then the conversation so far.

A request reads the cache up to the last point where its bytes still match the stored entry, and writes everything after that point as a new entry. So "a cache write" is not one flat cost per turn. Its size depends on where the match breaks:

- **The prefix holds.** The conversation grew at the end and nothing earlier moved. The turn reads the whole history at 0.1x and writes only the new turn at 2x. The write is small, and hits accrue as the conversation grows.
- **The prefix breaks early.** Something near the front of the prompt changed. The turn rewrites everything from that point on at 2x. On a long session that is a large write, and it lands on tokens that were already paid for once.

## What breaks the prefix early

These follow from the prefix rule and the render order above, not from measurement inside Claude Code:

- A model switch. Cache entries are per-model, so the new model starts cold.
- A fast-mode toggle. Documented as invalidating the cache.
- Adding or removing an MCP server, a plugin, or any tool mid-session. Tool definitions render at position 0, so the whole prompt moves.
- Editing `CLAUDE.md` or a file under `rules/`. Both land in the system prompt, ahead of the conversation.
- Auto-compact. It replaces the history with a summary, so the messages section is rewritten wholesale.

The last two are the ones this repo can influence. Both `rules/` and `autoCompactWindow` are configuration choices, and both sit in front of the conversation.

## When the setting wins

It wins on the normal shape of interactive work: turn, then a gap longer than 5 minutes while you read a diff, run a build, or answer something elsewhere, then another turn. Without the 1-hour TTL that gap expires the entry and the next turn pays full price for the entire prefix. With it, the next turn reads at 0.1x.

It loses on short bursts of rapid back-to-back turns, where the 5-minute TTL already covers every gap and costs 1.25x instead of 2x to write.

It also loses in a session that keeps breaking the prefix early. Each break is a fresh large write at 2x, and the session rarely reaches the third read that makes 1 hour cheaper than 5 minutes. The setting extends how long an entry stays readable. It does not reduce how often one is written.

## Sources

- The variable names and the flag table: `strings` over the Claude Code 2.1.241 binary at `~/.local/share/claude/versions/`.
- Prices, break-even arithmetic, prefix-match rule, and render order: the bundled `claude-api` skill, `shared/prompt-caching.md`.
- Live prices: <https://claude.com/pricing>.
