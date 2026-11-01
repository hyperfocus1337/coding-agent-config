# styles

The `Writing` style holds the Vale rules for the limits in [`writing.md`](../../../dot_claude/rules/writing.md), one YAML file per rule. [`vale.ini`](../vale.ini) applies them to `.md`, `.markdown`, `.org`, `.html`, `.htm`, and `.txt`. The [`lint-prose`](../../../dot_claude/hooks/lint-prose/README.md) hook and the [`prose-cleanup`](../../../dot_claude/skills/prose-cleanup/SKILL.md) skill run them through [`check.sh`](../scripts/check.sh).

## Rules

| Rule                                             | Level   | Checks                                                                               |
| ------------------------------------------------ | ------- | ------------------------------------------------------------------------------------ |
| [`ParagraphLength`](Writing/ParagraphLength.yml) | `error` | A paragraph, list item, or blockquote has at most 5 sentences.                       |
| [`ParagraphWords`](Writing/ParagraphWords.yml)   | `error` | A paragraph, list item, or blockquote has at most 100 words.                         |
| [`SectionWords`](Writing/SectionWords.yml)       | `error` | A section without subheadings has at most 400 words.                                 |
| [`ListInDisguise`](Writing/ListInDisguise.yml)   | `error` | A paragraph has at most 2 sequence words with a comma, such as "First," and "Then,". |

`ParagraphLength` is a Vale `occurrence` check with `max: 5`. It counts sentence ends: a `.`, `!`, or `?` before white space or the end of the text. A lookbehind keeps abbreviations such as "e.g.", "i.e.", "etc.", and "vs." from ending a sentence.

`ParagraphWords` and `SectionWords` are Vale `metric` checks on the word count, and the alert shows the count with two decimals, such as `125.00`. Vale measures each list item on its own, and it counts the words of a heading as part of its section.

Vale nests sections, so a section with subheadings holds the words of its subsections. For this reason `SectionWords` counts only a section that holds no other section, and a new subheading clears the alert. The text above the first subheading of a section is then not counted. The alert is on the heading line, which limits what the hook reports on an edit: see [Only the changed paragraphs](../../../dot_claude/hooks/lint-prose/docs/implementation.md#only-the-changed-paragraphs).

## Add a rule

1. Add a YAML file to [`Writing/`](Writing/), and a row to the table above.
2. Add the limit to `writing.md`, so the model knows it before the hook reports it.
3. Add a pass case and a fail case to [`test/check.ts`](../../../dot_claude/hooks/lint-prose/test/check.ts) of the hook.
4. Run `check.sh` or `/prose-cleanup` on this repository's docs, and set the rule to `error` only when it gives few false positives. [`docs/research.md`](../docs/research.md) lists the rules that were tested and left out.

Only an `error` alert reaches the model. Vale exits 0 on a `warning` or `suggestion` alert, and the hook then reports nothing. See [Why it blocks](../../../dot_claude/hooks/lint-prose/docs/implementation.md#why-it-blocks).
