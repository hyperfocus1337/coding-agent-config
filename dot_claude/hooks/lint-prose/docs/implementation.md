# Implementation notes

Why the hook is built the way it is, and what each rule counts in each format. [README.md](../README.md) describes the behavior for a user of the hook. This file is for a person who changes it or adds a rule.

The format behavior below was run on Vale 3.23.0 on 2026-09-27, not reasoned about.

## Why a separate hook

The paragraph check started as a `.md` branch in [`lint-all-languages`](../../lint-all-languages/README.md). It moved here for these reasons:

1. **Prose and code need different input.** A code linter needs the whole file, because a part of a Python file does not parse. A prose rule can check only the text an `Edit` wrote. In `lint-all-languages` that logic was prose-only state in a hook that is about code.
2. **Less complexity in each hook.** `lint-all-languages` keeps one linter per extension and no `Edit` logic. This hook has one input path per case and one linter.
3. **Room to grow.** More Vale rules come from [`technical-linting-rules.md`](../../../../docs/research/hooks/linting/technical-linting-rules.md). Vale can also lint comments in code files, and a `.py` file in `lint-all-languages` would then need two linters in one branch.
4. **Precedent.** [`format-org-tables`](../../format-org-tables/README.md) is a separate hook for one concern, next to `format-all-languages`.

The cost is a third copy of the code that finds the files: the payload read, the Bash path search with the 120-second mtime test, and the temp-file skip. It is about 40 lines. A shared library would be one more file for every hook to source, for three callers.

## Rules

All rules live in [`vale/styles/Writing/`](../vale/styles/Writing/), one YAML file per rule. [`vale/vale.ini`](../vale/vale.ini) applies the `Writing` style to `.md`, `.markdown`, `.org`, `.html`, and `.htm`. `check.sh` runs Vale with `--no-global --config`, so a repository's own `.vale.ini` and the user's global Vale config are never read.

| Rule                                                            | Level   | Checks                                                                        |
| --------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| [`ParagraphLength`](../vale/styles/Writing/ParagraphLength.yml) | `error` | A paragraph, list item, or blockquote has at most 6 sentences (`writing.md`). |

`ParagraphLength` is a Vale `occurrence` check with `max: 6`. It counts sentence ends: a `.`, `!`, or `?` before white space or the end of the text. A lookbehind keeps abbreviations such as "e.g.", "i.e.", "etc.", and "vs." from ending a sentence.

To add a rule, add a YAML file to `vale/styles/Writing/`, add a row to the table above, and add a pass case and a fail case to `test/test.sh`. Vale exits 1 only on an `error` alert, so a rule at `warning` or `suggestion` never blocks and Claude never sees it. See [Why it blocks](#why-it-blocks).

## What each format counts

Vale parses each format and applies the rule to its prose scopes only. Text outside those scopes has no sentences for the rule to count.

| Format   | Counted                                                       | Not counted                                        |
| -------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Markdown | Paragraphs, list items, blockquotes                           | Frontmatter, headings, code spans, code blocks     |
| Org      | Paragraphs, list items, `#+begin_quote` blocks                | `#+` keyword lines, headings, `#+begin_src` blocks |
| HTML     | Text in `<p>`, `<li>`, `<div>`, `<blockquote>`, and `<title>` | Tags and attributes, `<script>`, `<pre>`           |

A `<title>` counts as a paragraph. A title with 7 sentences is not a real case, so no exclusion is configured for it.

## Frontmatter

Vale stops with an error on Markdown frontmatter that is not valid YAML, such as the unquoted brackets of a command's `argument-hint: [a | b]`. So `check.sh` sends each file to Vale on stdin, with `--path` for the file name, and blanks the frontmatter lines first. Blank lines keep the line numbers right.

Org needs no such step. Vale read `#+title: A [b] {c}` without an error. The blanking only acts on a file whose first line is `---`, so it does not change Org or HTML files.

## Edit checks only the text it wrote

A `Write` or a Bash command checks the whole file, because it wrote the whole file. An `Edit` or `MultiEdit` checks only its `new_string` values, sent to Vale on stdin with `--ext` set to the file's extension. Without this, an old long paragraph elsewhere in the file blocks every edit to the file, including the edit that starts to fix it.

The hook joins the `new_string` values of a `MultiEdit` with a blank line, so two edits do not join into one paragraph. The blank line separates paragraphs in all three formats: two bare-text parts with 3 and 4 sentences, sent as `.html`, gave no alert.

The limit of this shortcut: an edit that adds one sentence to an existing 6-sentence paragraph is checked without the rest of that paragraph, so it passes. The next `Write` of the file catches it. The upgrade is to run Vale on the whole file and keep only the alerts on the lines the edit changed. The trade-off has a `shortcut:` comment in `hook.sh`.

## Why it blocks

An `error` alert makes Vale exit 1, and the hook then exits 2. A `PostToolUse` hook reaches the model only when it exits 2. On exit 0 its output goes to the transcript, and Claude never sees it. [`lint-all-languages`](../../lint-all-languages/README.md#why-it-blocks) gives the full reason.

Blocking means each new rule must have few false positives. Test a rule against this repository's docs with `/docs:paragraphs` or `check.sh` before you set it to `error`.
