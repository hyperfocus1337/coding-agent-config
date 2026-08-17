# Instruction load and adherence

[`skills-context.md`](skills-context.md) counts the characters a session loads. This doc counts something the character total hides: how many separate directives the model is asked to obey at once, and which of them contradict each other. Token cost is linear and cheap. Adherence is not: it falls off with the number of constraints active in a single response, and it collapses when two constraints tell the model opposite things.

Snapshot taken 2026-08-17, on `opus[1m]` with the six plugins in `settings.json` enabled.

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

| Source                        |     Chars | Directives | Loads                         |
| ----------------------------- | --------: | ---------: | ----------------------------- |
| `dot_claude/CLAUDE.md`        |       214 |          0 | session start                 |
| `dot_claude/rules/writing.md` |     1,533 |         15 | session start                 |
| `dot_claude/rules/tools.md`   |     1,292 |         10 | session start                 |
| **Authored here**             | **3,039** |     **25** |                               |
| `ponytail` SessionStart hook  |     5,229 |        ~40 | start, resume, clear, compact |
| `caveman` SessionStart hook   |     4,180 |        ~22 | start, resume, clear, compact |
| **Injected by plugins**       | **9,409** |    **~62** |                               |

`CLAUDE.md` contributes zero directives. It is an index that points at `rules/`, which is the correct shape and costs nothing in adherence.

The two activation hooks carry **2.5 times the directives and 3.1 times the characters of everything this repo authors**, and they re-fire on every compaction. `caveman` adds a further UserPromptSubmit reminder of about 150 characters to every single prompt.

Measured detail worth recording: **ponytail's intensity levels do not change the injected size.** `getPonytailInstructions()` returns 5,202 characters at `lite`, 5,229 at `full` and 5,267 at `ultra`, a spread of 65 characters. `caveman` filters its `SKILL.md` by level and still emits 4,180 characters at `full`. Switching either plugin to a lighter level is not a context or adherence saving. This corrects the suggestion in [`skills-context.md`](skills-context.md), which assumed lighter levels would pay.

## The prose channel is oversubscribed, the tools channel is not

Raw directive count is the wrong unit, because most directives are conditional. `tools.md` fires `findReferences` only before a rename, Context7 only before generating library code, `markitdown` only before a PDF read, `pnpm` only on Node work. A typical turn activates two or three of its ten. That file is comfortable.

`writing.md` is different. All 15 of its directives apply to any prose output, which is every turn. `caveman` adds roughly nine more constraints to the same output. So a plain answer in this session is generated under **about 24 simultaneous, heterogeneous, judgement-shaped constraints on one channel**, which is the exact regime ManyIFEval measures.

Applying `p^N` to the prose channel:

| Per-directive adherence | 15 directives (writing.md alone) | 24 directives (with caveman) |
| ----------------------- | -------------------------------: | ---------------------------: |
| 0.99                    |                             86 % |                         79 % |
| 0.98                    |                             74 % |                         62 % |
| 0.95                    |                             46 % |                         29 % |

These are projections from the benchmark model, not measurements of this setup. They are directional: the tools channel is nowhere near its ceiling, the prose channel already is.

## Conflicts, which cost more than count

`p^N` assumes the directives are independent. Contradictory directives break that assumption, because satisfying one guarantees failing the other. Three live collisions:

| A                                                                                    | B                                                                         | Effect                                                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `writing.md:5` short direct sentences, **active voice**, one main idea, full grammar | `caveman` drop articles, fragments OK                                     | Direct contradiction on every prose output. Neither file cedes.                                                         |
| `writing.md:20` scope explicitly includes **answers**                                | `caveman` "ACTIVE EVERY RESPONSE"                                         | Both claim the same channel. No precedence is written down anywhere.                                                    |
| `writing.md:10` give specific quantities, state cause and result                     | `ponytail` at most three short lines, delete explanation longer than code | Resolvable, `ponytail` exempts explanation the user asked for, but the exemption lives in the plugin, not in this repo. |

A fourth is milder and worth knowing: `tools.md:5` says to use `rg` and `fd` **instead of** the Grep and Glob tools, while the Claude Code system prompt says to prefer the dedicated file and search tools over shell commands. The repo rule is the more specific one and normally wins, but it is competing rather than composing.

The first two are the expensive kind. When two standing rules cover the same output and neither states precedence, the model picks per turn, and the choice drifts across a session in exactly the way Multi-IF describes.

## What to change

Ranked by adherence recovered per unit of effort.

**1. Give the prose channel one authority.** Drop the `caveman` SessionStart hook and keep the plugin for on-demand `/caveman`. This removes ~22 directives, 4,180 characters per session start and compaction, the per-prompt reminder, and both of the expensive conflicts. Nothing is lost: the mode is still one slash command away. This is the single highest-value change on the machine.

**2. Make `ponytail` invocation-time rather than session-time.** Its 40 directives govern how code gets built, which matters on coding turns and is dead weight on every other turn. As a skill it loads when relevant, which is what skills are for. Removes ~5,229 characters per injection. Do not reach for a lighter level instead, the measurement above shows it saves 27 characters.

**3. If both hooks stay, write the precedence down.** Three lines in `CLAUDE.md` naming which authority owns prose, and which owns code shape, converts a silent per-turn coin flip into a rule the model can follow. Cheap, and strictly better than leaving it implicit.

**4. Move enforceable rules out of the prompt and into hooks.** A hook has p = 1.0 and costs no adherence budget. `enforce-cli-tools/rules` already covers `npm` and `yarn`, which is why that directive is reliable. Adding `grep rg` and `find fd` rows would retire `tools.md:5` the same way. Caveat before doing it: the hook matches the command position after a pipe as well, so `git log | grep x` would be blocked. Worth it only if that friction is acceptable.

**5. Leave `rules/` as it is otherwise.** 25 directives across two files is not bloat, the files state decisions rather than procedures, and `tools.md` is mostly conditional. The instinct that prompted this review was right about the risk and pointed at the wrong file.

**6. Low priority: order by violation rate.** The primacy effect is real but peaks far above this density, so putting the most-broken rule first in `writing.md` is a small win. Do it opportunistically, not as a task.

For anything added later, the test is not "is this file getting long". It is: does this directive apply on every turn, and does anything else already govern the same output? An unconditional prose rule is expensive. A conditional tool rule is nearly free. A hook is free.

## Reproducing these numbers

```sh
# Authored load
wc -c ~/.claude/CLAUDE.md ~/.claude/rules/*.md

# Ponytail injection, per level
node -e 'const p=require("$HOME/.claude/plugins/cache/ponytail/ponytail/4.9.0/hooks/ponytail-instructions.js");
for (const l of ["lite","full","ultra"]) console.log(l, p.getPonytailInstructions(l).length)'

# Caveman injection
cd ~/.claude/plugins/cache/caveman/caveman/*/ && CLAUDE_PLUGIN_ROOT="$PWD" \
  node src/hooks/caveman-activate.js </dev/null | wc -c
```

Directive counts are hand-counted, one per imperative that changes behaviour. The plugin figures drift with plugin versions, so re-measure after an update.

Sources: [How Many Instructions Can LLMs Follow at Once? (IFScale)](https://arxiv.org/html/2507.11538v1), [Curse of Instructions / ManyIFEval](https://openreview.net/forum?id=R6q67CDBCH), [When Instructions Multiply](https://aclanthology.org/2025.findings-emnlp.896/), [Multi-IF](https://arxiv.org/abs/2410.15553).
