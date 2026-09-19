# Instruction load and adherence

[`skills-context.md`](skills-context.md) counts the characters a session loads. This doc counts something the character total hides: how many separate directives the model is asked to obey at once, and which of them contradict each other. Token cost is linear and cheap. Adherence is not: it falls off with the number of constraints active in a single response, and it collapses when two constraints tell the model opposite things.

Measured 2026-08-22 on `opus[1m]`, with the four plugins in `settings.json` enabled.

## How many instructions a frontier model holds

There is no single number, because the answer depends on what kind of instruction it is. Three benchmarks bracket the range.

**Simple, uniform, independent constraints scale far.** IFScale asks a model to write a business report that includes N exact keywords, from 10 up to 500. Frontier models score 94 to 100 percent at 10 instructions and 92 to 100 percent at 50. Decline starts near 150, and at 500 the best models land between 51 and 69 percent (Gemini 2.5 Pro 69, o3-high 63, Grok-3 62), while weaker models fall to 15 to 21 percent. Three decay shapes appear: reasoning models hold flat then drop steeply after ~150 (threshold), GPT-4.1 and Claude 3.7 Sonnet decline steadily (linear), and small models collapse early (exponential). The dominant failure is omission, not partial compliance. The model drops an instruction rather than approximating it.

**Heterogeneous format constraints scale much worse.** ManyIFEval stacks up to 10 different verifiable instructions (case, length, structure, forbidden words) on one prompt. At 10 instructions GPT-4o satisfied _all_ of them 15 percent of the time and Claude 3.5 Sonnet 44 percent. The paper names the mechanism the "curse of instructions": joint success is per-instruction success raised to the power of the instruction count.

```
P(all N satisfied) ≈ p^N
```

That single formula explains the gap between the two benchmarks. Keyword inclusion has p near 0.999, so 500 of them still mostly work. A judgement-shaped style rule has p near 0.97, and 0.97^15 is 0.63.

**Adherence also decays across turns.** Multi-IF measures the same instructions over three turns. o1-preview falls from 0.877 to 0.707, GPT-4 from 0.815 to 0.609. The named failure mode is instruction forgetting, and most models do not recover once they drop a rule. Session-start text is turn-zero text, so every rule in `CLAUDE.md` and `rules/` is subject to this decay for the whole session.

Two more results matter for how a rules file should be written. Instruction position produces a primacy effect that peaks around 150 to 200 instructions, where later instructions are 1.5 to 2 times more likely to be missed. And instruction-level chain of thought, checking each constraint explicitly before answering, lifted GPT-4o at 10 instructions from 15 to 31 percent and Claude 3.5 Sonnet from 44 to 58 percent. Adherence responds to verification, not to emphasis.

## What this machine actually asks for

Counting each imperative that changes behaviour as one directive:

| Source                                 |     Chars | Directives | Loads                           |
| -------------------------------------- | --------: | ---------: | ------------------------------- |
| `dot_claude/CLAUDE.md`                 |       259 |          0 | session start                   |
| `dot_claude/rules/writing.md`          |     1,533 |         15 | session start                   |
| `dot_claude/rules/tools.md`            |     1,292 |         10 | session start                   |
| `dot_claude/rules/code.md`             |     1,325 |         13 | session start                   |
| **Authored here**                      | **4,409** |     **38** |                                 |
| `dot_claude/commands/style/caveman.md` |     1,292 |          9 | only when `/style:caveman` runs |

`CLAUDE.md` contributes zero directives. It is an index that points at `rules/`, which is the correct shape and costs nothing in adherence.

Every directive in the standing load is authored here, and no plugin injects instruction text at session start. That matters for adherence as well as for characters: injected text is untruncatable, re-fires on compaction, and is written by someone who cannot see the rest of the prompt it lands in.

## The prose channel is oversubscribed, the tools channel is not

Raw directive count is the wrong unit, because most directives are conditional. `tools.md` fires `findReferences` only before a rename, Context7 only before generating library code, `markitdown` only before a PDF read, `pnpm` only on Node work. A typical turn activates two or three of its ten. That file is comfortable. `code.md` is conditional in the same way: its 13 directives apply on a coding turn and are silent on the rest.

`writing.md` is different. All 15 of its directives apply to any prose output, which is every turn. `/style:caveman` adds nine more constraints to the same channel while it is active, which puts a plain answer under **about 24 simultaneous, heterogeneous, judgement-shaped constraints**, the exact regime ManyIFEval measures. That is the reason the mode is opt-in: the prose channel carries 15 by default and reaches 24 only when the mode is asked for.

Applying `p^N` to the prose channel:

| Per-directive adherence | 15 directives (writing.md alone) | 24 directives (with `/style:caveman`) |
| ----------------------- | -------------------------------: | ------------------------------------: |
| 0.99                    |                             86 % |                                  79 % |
| 0.98                    |                             74 % |                                  62 % |
| 0.95                    |                             46 % |                                  29 % |

These are projections from the benchmark model, not measurements of this setup. They are directional: the tools channel is nowhere near its ceiling, the prose channel already is.

## Conflicts, which cost more than count

`p^N` assumes the directives are independent. Contradictory directives break that assumption, because satisfying one guarantees failing the other, so every rule that overrides another states what it overrides and where the override stops.

One override is live. `commands/style/caveman.md` suspends the sentence-level rules in `writing.md`, active voice and one main idea per full sentence, and says so in the file. The formatting rules keep applying while it runs: no em dashes, no hard-wrapped prose, sentence case in headings. Code, commits, and pull request text stay normal prose. The precedence sits in the file that takes the exception, so it arrives with the exception rather than loading in the index for every session that never uses it.

One competition is live and worth knowing: `tools.md:5` says to use `rg` and `fd` **instead of** the Grep and Glob tools, while the Claude Code system prompt says to prefer the dedicated file and search tools over shell commands. The repo rule is the more specific one and normally wins, but it competes rather than composes.

## What to change

Ranked by adherence recovered per unit of effort.

**1. Move enforceable rules out of the prompt and into hooks.** A hook has p = 1.0 and costs no adherence budget. `enforce-cli-tools/rules` covers `npm` and `yarn`, which is why that directive is reliable. Adding `grep rg` and `find fd` rows would retire `tools.md:5` the same way. Caveat before doing it: the hook matches the command position after a pipe as well, so `git log | grep x` would be blocked. Worth it only if that friction is acceptable.

**2. Leave `rules/` as it is otherwise.** 38 directives across three files is not bloat: the files state decisions rather than procedures, and two of the three are conditional.

**3. Low priority: order by violation rate.** The primacy effect is real but peaks far above this density, so putting the most-broken rule first in `writing.md` is a small win. Do it opportunistically, not as a task.

For anything added, the test is not "is this file getting long". It is: does this directive apply on every turn, and does anything else already govern the same output? An unconditional prose rule is expensive. A conditional tool rule is nearly free. A hook is free.

Condensing a directive set is a separate lever from where the text loads, and it is the one that pays. Characters follow the text, not the channel, so moving a block from a hook into `rules/` saves only what the hook's breadcrumbs cost. The saving comes from four operations on the text itself: delete prose that states no rule, delete machinery that only means something to the tool that shipped it, deduplicate directives stated more than once, and delegate to an authority the repo already has. What must survive is every condition that makes a directive actionable. "Find every caller of the function you change" is shorter than the paragraph it came from and still tells the reader what to do; "fix the root cause" is shorter still and tells them nothing.

## Reproducing these numbers

```sh
# Authored load
wc -c ~/.claude/CLAUDE.md ~/.claude/rules/*.md

# A command or skill body, which costs nothing until invoked
wc -c ~/.claude/commands/style/caveman.md
```

Directive counts are hand-counted, one per imperative that changes behaviour.

Sources: [How Many Instructions Can LLMs Follow at Once? (IFScale)](https://arxiv.org/html/2507.11538v1), [Curse of Instructions / ManyIFEval](https://openreview.net/forum?id=R6q67CDBCH), [When Instructions Multiply](https://aclanthology.org/2025.findings-emnlp.896/), [Multi-IF](https://arxiv.org/abs/2410.15553).
