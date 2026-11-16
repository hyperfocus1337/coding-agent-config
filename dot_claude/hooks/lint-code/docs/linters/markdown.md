# Markdown: rumdl

rumdl runs with 3 rules, for content errors that a formatter cannot see:

| Rule  | Reports                                                    |
| ----- | ---------------------------------------------------------- |
| MD056 | A table row with more or fewer cells than the header       |
| MD057 | A relative link to a file that does not exist              |
| MD051 | A link to a heading that does not exist, in any local file |

oxfmt aligns a short row and keeps its cell count, so an edit that drops a `|` passes the formatter and shows its text in the wrong columns. The hook passes `--no-config` and an explicit rule list, so a rumdl configuration of the project or a new rumdl version adds no style rules: oxfmt owns the format. Do not run `rumdl fmt` to fix a finding. For a short row it adds an empty cell at the end, not the pipe where it belongs.

MD057 checks a link against the files on disk. In a chezmoi source repository, link to the source name, such as `dot_claude/`, not to the deployed name.
