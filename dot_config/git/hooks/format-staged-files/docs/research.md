# Research for format-staged-files

## How often the model had to amend

In 205 sessions from 2026-08-30 to 2026-09-27, a formatter told the model to amend a commit approximately 60 times, in at least 5 repositories. Each time, one Bash command wrote a file and committed it before the formatters ran. See [hook event scoping](../../../../../docs/research/hooks/event-scoping.md).

## Cost

- **A commit outside an agent:** one Node start, about 20 ms. `main.ts` exits at once when no agent variable is set.
- **A commit in an agent session:** one run of each formatter for all staged files. On 2026-10-21, in the devcontainer:

| Commit                                  | One run for each file | One run for all files |
| --------------------------------------- | --------------------- | --------------------- |
| 10 Markdown files that Prettier changes | 1277 ms               | 334 ms                |
| 10 text files that no formatter handles | 538 ms                | 77 ms                 |

Before, each file cost three Node starts of about 18 ms, plus about 120 ms for each Prettier run.
