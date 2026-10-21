# Research for format-staged-files

## How often the model had to amend

In 205 sessions from 2026-08-30 to 2026-09-27, a formatter told the model to amend a commit approximately 60 times, in at least 5 repositories. Each time, one Bash command wrote a file and committed it before the formatters ran. See [hook event scoping](../../../../../docs/research/hooks/event-scoping.md).

## Cost

- **A commit outside an agent:** one Node start, about 20 ms. `main.ts` exits at once when no agent variable is set.
- **A commit in an agent session:** one formatter run for each file and formatter. A Node start costs about 20 ms, and Prettier about 0.4 s for each run, so a commit of 30 files adds about 13 s.

[`decisions.md`](../../../../../docs/hooks/decisions.md#format-staged-files-runs-for-each-agent) gives a cost of about 18 ms for each file and formatter, and about 180 ms for a commit of 5 files.
