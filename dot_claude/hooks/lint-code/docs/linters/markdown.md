# Markdown: rumdl

rumdl runs with 17 of its 90 rules. Each rule reports a content error that a formatter cannot see: the text renders wrong, a link goes nowhere, an image has no text for a screen reader, or the file is damaged.

## Rules that the hook runs

| Rule  | Reports                                                                        |
| ----- | ------------------------------------------------------------------------------ |
| MD011 | A reversed link, `(text)[url]`, which renders as text                          |
| MD042 | A link with an empty destination, such as `[text]()` or `[text](#)`            |
| MD045 | An image without alt text                                                      |
| MD051 | A link to a heading that does not exist, in any local file                     |
| MD052 | A reference link, `[text][label]`, with no definition for the label            |
| MD056 | A table row with more or fewer cells than the header                           |
| MD057 | A relative link to a file that does not exist                                  |
| MD066 | A footnote reference with no footnote definition                               |
| MD068 | An empty footnote definition                                                   |
| MD070 | A code fence inside a code block that closes the block too early               |
| MD083 | Mojibake: text that was decoded with the wrong encoding, such as `Ã©` for `é`  |
| MD084 | Invisible Unicode characters at a line edge, next to a space, or in a sequence |
| MD086 | An HTML comment without `-->`, which hides the remaining text of the file      |
| MD091 | Markdown inside an HTML block, which renders as literal text                   |
| MD092 | Merge conflict markers                                                         |
| MD094 | A file that is not valid UTF-8                                                 |
| MD095 | A link destination with a non-ASCII character that looks like an ASCII one     |

## Rules that the hook does not run

| Rules                                                                                                                                                                                                                                 | Reason                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MD003, MD004, MD005, MD007, MD009, MD010, MD012, MD019, MD020, MD021, MD022, MD023, MD027, MD029, MD030, MD031, MD032, MD035, MD046, MD047, MD048, MD049, MD050, MD055, MD058, MD060, MD064, MD065, MD069, MD071, MD076, MD077, MD085 | Layout: spaces, blank lines, indentation, list markers, fence and emphasis style, and table alignment. oxfmt writes the layout.                                                                                                                      |
| MD001, MD014, MD024, MD025, MD026, MD028, MD033, MD034, MD036, MD039, MD040, MD041, MD053, MD054, MD062, MD067, MD072, MD082, MD087, MD090, MD093                                                                                     | Style: the text renders as the author intends. In this repository MD041 reports 83 files without a top-level heading on the first line, 79 of them with frontmatter, and MD036 reports 17 bold labels such as `**Pros**`.                            |
| MD080                                                                                                                                                                                                                                 | Two headings with the same anchor, such as `## Hooks` and `### Hooks`. GitHub adds `-1` to the second anchor, and MD051 reports a link to an anchor that does not exist.                                                                             |
| MD013, MD059, MD063, MD081, MD088, MD089                                                                                                                                                                                              | Prose: line length, link text, heading case, emphasis count, typographic quotes, and CJK spacing. Paragraphs are one line, and MD063 expects Title Case by default. The writing rules and [`lint-prose`](../../../lint-prose/README.md) cover prose. |
| MD043, MD044, MD061, MD073, MD096                                                                                                                                                                                                     | Each rule needs a project configuration, such as the required headings, names, or forbidden terms. `--no-config` drops it.                                                                                                                           |
| MD074, MD078, MD079                                                                                                                                                                                                                   | Other file types: MkDocs `mkdocs.yml` and Quarto chunks.                                                                                                                                                                                             |
| MD018                                                                                                                                                                                                                                 | False positives: it reports `#123 is the issue` and `#tag` at the start of a line as headings without a space, and `rumdl fmt` changes them to headings.                                                                                             |
| MD037                                                                                                                                                                                                                                 | False positives: it reports cron schedules such as `"*/30 * * * *"` as emphasis with spaces.                                                                                                                                                         |
| MD038                                                                                                                                                                                                                                 | False positives: it reports code spans with an intentional space, such as `` `@docs/ ` ``. All 6 findings in this repository are intentional.                                                                                                        |
| MD075                                                                                                                                                                                                                                 | False positives: it reports a `\|` in link text or in a shell command as a table row without a header. It has no option to report only a row that a blank line separates from its table.                                                             |

## Notes on the rules

The hook passes `--no-config` and an explicit rule list, so a rumdl configuration of the project or a new rumdl version adds no style rules: oxfmt owns the format. Do not run `rumdl fmt` to fix a finding.

### MD056: table rows

oxfmt aligns a short row and keeps its cell count, so an edit that drops a `|` passes the formatter and shows its text in the wrong columns. `rumdl fmt` adds an empty cell at the end of a short row, not the pipe where it belongs.

### MD057: relative links

MD057 checks a link against the files on disk. In a chezmoi source repository, link to the source name, such as `dot_claude/`, not to the deployed name.

### MD092: merge conflict markers

MD092 stops the other checks of the file until you remove the conflict markers.

### MD011, MD052, and MD066: code in prose

MD011, MD052, and MD066 also report code in prose that looks like their syntax, such as `(url)[:16]`, `filter[field][operator]`, or the regular expression `[^a-z0-9]`. To fix such a finding, put the code in a code span.

## How the rules were selected

The test used rumdl 0.3.4 on 2026-11-16:

1. All 90 rules ran on the 259 Markdown files of this repository. A rule with many findings in correct files is a style rule.
2. A probe file with one defect per candidate rule showed that each candidate reports its defect.
3. The candidates ran on 8,499 Markdown files of other repositories and installed plugins. A sample of findings per rule showed the false positives in the last 4 rows of the table above, and the code in prose that MD011, MD052, and MD066 report.
4. The deployed hook ran on a scratch repository with one defect for each of the 17 rules, and reported all 17.

The 17 rules give no findings in this repository.
