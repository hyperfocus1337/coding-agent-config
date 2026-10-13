# Implementation notes

Why the hook is built the way it is, and what each rule counts in each format. [README.md](../README.md) describes the behavior for a user of the hook. This file is for a person who changes it or adds a rule.

The format behavior below was run on Vale 3.23.0, not reasoned about: Markdown, Org, and HTML on 2026-09-27, and plain text on 2026-10-04.

## Why a separate hook

The paragraph check started as a `.md` branch in [`lint-all-languages`](../../lint-all-languages/README.md). It moved here for these reasons:

1. **Prose and code need different scopes.** A code linter reports on the whole file. A prose rule reports only on the paragraphs a git diff marks as changed. In `lint-all-languages` that logic was prose-only state in a hook that is about code.
2. **Less complexity in each hook.** `lint-all-languages` keeps one linter per extension and no diff logic. This hook has one input path per case and one linter.
3. **Room to grow.** More Vale rules come from [`technical-linting-rules.md`](../../../../docs/research/hooks/linting/technical-linting-rules.md). Vale can also lint comments in code files, and a `.py` file in `lint-all-languages` would then need two linters in one branch.
4. **Precedent.** [`format-org-tables`](../../format-org-tables/README.md) is a separate hook for one concern, next to `format-all-languages`.

The cost is a second copy of the payload read and the temp-file skip, about 10 lines.

## Rules

All rules live in [`dot_config/vale/styles/Writing/`](../../../../dot_config/vale/styles/Writing/), one YAML file per rule, so every lint-prose hook uses the same rules. [`vale.ini`](../../../../dot_config/vale/vale.ini) applies the `Writing` style to `.md`, `.markdown`, `.org`, `.html`, `.htm`, and `.txt`. `check.sh` runs Vale with `--no-global --config`, so a repository's own `.vale.ini` and the user's global Vale config are never read.

| Rule                                                                                | Level   | Checks                                                                        |
| ----------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| [`ParagraphLength`](../../../../dot_config/vale/styles/Writing/ParagraphLength.yml) | `error` | A paragraph, list item, or blockquote has at most 5 sentences (`writing.md`). |

`ParagraphLength` is a Vale `occurrence` check with `max: 5`. It counts sentence ends: a `.`, `!`, or `?` before white space or the end of the text. A lookbehind keeps abbreviations such as "e.g.", "i.e.", "etc.", and "vs." from ending a sentence.

To add a rule, add a YAML file to `dot_config/vale/styles/Writing/`, add a row to the table above, and add a pass case and a fail case to `test/test.sh`. Vale exits 1 only on an `error` alert, so a rule at `warning` or `suggestion` never blocks and Claude never sees it. See [Why it blocks](#why-it-blocks).

## What each format counts

Vale parses each format and applies the rule to its prose scopes only. Text outside those scopes has no sentences for the rule to count.

| Format   | Counted                                                       | Not counted                                        |
| -------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Markdown | Paragraphs, list items, blockquotes                           | Frontmatter, headings, code spans, code blocks     |
| Org      | Paragraphs, list items, `#+begin_quote` blocks                | `#+` keyword lines, headings, `#+begin_src` blocks |
| HTML     | Text in `<p>`, `<li>`, `<div>`, `<blockquote>`, and `<title>` | Tags and attributes, `<script>`, `<pre>`           |
| Text     | Each block of lines between blank lines                       | Nothing                                            |

A `<title>` counts as a paragraph. A title with 6 sentences is not a real case, so no exclusion is configured for it.

Vale 3.23.0 hands AsciiDoc and reStructuredText to an external tool (`asciidoctor`, `rst2html`) and stops with exit 2 when that tool is missing, so the hook does not take `.adoc` or `.rst` files.

Plain text has no markup, so Vale cannot tell prose from a log. A log with one sentence per line gives an alert for the whole block. The hook only sees a `.txt` file that Claude writes with `Write` or `Edit`, which is prose, not a log.

## Frontmatter

Vale stops with an error on Markdown frontmatter that is not valid YAML, such as the unquoted brackets of a command's `argument-hint: [a | b]`. So `check.sh` sends each file to Vale on stdin, with `--path` for the file name, and blanks the frontmatter lines first. Blank lines keep the line numbers right.

Org needs no such step. Vale read `#+title: A [b] {c}` without an error. The blanking only acts on a file whose first line is `---`, so it does not change Org or HTML files.

## Only the changed paragraphs

A `Write` or `Edit` that changes one paragraph of a file sends the whole file to Vale. An `Edit` does not send only its `new_string`, because then an edit that adds a 6th sentence to an existing paragraph would pass. Before this filter, every old long paragraph in the file blocked each write again. The model read the same alerts on each write, about text it did not write. On a real `dot_doom.d/config.org` with uncommitted changes, the whole-file check gave 14 alerts, and the filter gave 0, because no change was in a long paragraph.

The filter reads `git diff -U0` for the file and collects the changed line numbers from the `+start,count` part of each hunk header. A hunk with a count of 0 is a deletion, and it marks the line before it, so a paragraph that lost a sentence still counts as changed. Vale reports a paragraph alert at the first line of the paragraph. The hook keeps an alert when a changed line falls between that line and the next blank line.

| Case                                         | Compared against     |
| -------------------------------------------- | -------------------- |
| A tracked file                               | `HEAD`               |
| Outside git, an untracked file, first commit | Nothing: every alert |

The diff against `HEAD` also holds changes from before the session. Those are uncommitted work, so their alerts are still useful. A tight list with no blank lines is one span, so a change to one item keeps the alerts of every long item in that list. The upgrade is to find item boundaries, and the trade-off has a `shortcut:` comment in `hook.sh`.

The hook has no switch to report the whole file. For a session that cleans up old paragraphs, use the [`prose-cleanup`](../../../skills/prose-cleanup/SKILL.md) skill, which runs `check.sh` without the filter.

## Once per session

The changed-paragraph filter still lets one alert block many times. A long paragraph with an uncommitted change blocks on each later edit to the same file, also an edit to another paragraph. When the hook still ran on Bash, `git add`, `git commit`, and `git log` each named the same file, and one long paragraph blocked 4 times in a row.

So each alert blocks once per session. After a block, the hook adds a line to `$TMPDIR/lint-prose-<session_id>` for each alert: the file path, the rule, and the `cksum` of the paragraph text. When a later check finds an alert with that line in the record, the hook lists it under `lint-prose: blocked on before in this session` and exits 1. The user sees it, and Claude does not get a block.

The key holds the paragraph text, not the line number, for two reasons:

- An edit above the paragraph moves it to a new line. The text is the same, so the alert stays a repeat.
- An edit to the paragraph that leaves it too long changes the text. The alert is then new, and it blocks again.

A payload with no `session_id`, or one with characters outside `A-Z a-z 0-9 _ -`, has no record, so every alert blocks. The record stays in `$TMPDIR` until the system clears it.

## Why not Bash

The hook ran on Bash until 2026-10-13. A Bash payload names no file, so the hook took the prose paths from the command text and kept the ones with an mtime under 120 seconds old. The command text also names files that the command only reads. In one session, 5 read-only commands such as `rg … config.org` and `sed -n 420p config.org` each blocked, because a parallel session had saved `config.org` in the last 2 minutes. An mtime cannot tell which process wrote the file.

To find the files a command wrote, the hook must compare the disk before and after the command, as [`track-bash-changes`](../../track-bash-changes/README.md) does. That is a `PreToolUse` snapshot and state per call, for prose that Claude almost always writes with `Write` or `Edit`. So the hook does not run on Bash, and prose that a Bash command writes, such as `cat > notes.md <<EOF`, is not checked. To check it, run `/prose-cleanup` or `check.sh`.

## Why it blocks

An `error` alert makes Vale exit 1, and the hook then exits 2. A `PostToolUse` hook reaches the model only when it exits 2. On exit 0 its output goes to the transcript, and Claude never sees it. [`lint-all-languages`](../../lint-all-languages/README.md#why-it-blocks) gives the full reason.

Vale exits 2 when it fails, for example on a rule it cannot load or on input it cannot parse. `check.sh` passes that code through, and the hook then exits 1 with `lint-prose: Vale failed` and Vale's error. Exit 1 shows the message to the user and does not block. The error is not in the prose, so a block would tell Claude to fix text that is correct.

When `vale` is on `PATH` but `~/.config/vale/scripts/check.sh` is missing, chezmoi did not deploy the Vale config on that machine. The hook then exits 1 with a message that names the missing file and tells you to run `just chezmoi`. It checks this only after it finds a prose file to lint, so other edits stay silent.

Before this change, a failure on `Write` or Bash exited 0 with no output, the same as a clean pass, and a failure on `Edit` blocked as an alert. The Vale team's [`vale-edit.sh`](https://github.com/vale-cli/agent-tools/blob/main/hooks/vale-edit.sh) has the same split between alerts and a failed run.

Blocking means each new rule must have few false positives. Test a rule against this repository's docs with `/prose-cleanup` or `check.sh` before you set it to `error`.
