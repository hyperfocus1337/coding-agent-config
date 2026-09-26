---
disable-model-invocation: true
---

# organize slash commands

Every command here moves content and labels it. Reordering is the point; rewriting is opt-in and never silent. `docs/` is the opposite: its commands rewrite prose and leave the order alone.

| Command                | Reorders                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `/organize:headings`   | Markdown sections: fixes heading levels, regroups, reorders.     |
| `/organize:comments:*` | A config or code file into comment-delimited sections, by style. |

`organize:headings` is a standalone prompt. It shows the before and after outline, then asks two questions before it writes: may it rewrite sentences, and does it repair the defects it spotted (duplicate headings, empty sections, a stale table of contents). Answer "keep every word" to both and it is a pure move.

The `comments/` commands are thin wrappers over the `organize-with-comments` skill, differing only in header style. They skip the style prompt the skill would otherwise ask.

| Command                            | Header style                                         |
| ---------------------------------- | ---------------------------------------------------- |
| `/organize:comments:banner`        | Three-line banner headers.                           |
| `/organize:comments:rule-banner`   | Three-line banner headers with box-drawing rules.    |
| `/organize:comments:boxed`         | Full-box headers.                                    |
| `/organize:comments:numbered`      | Numbered sections with a matching table of contents. |
| `/organize:comments:underlined`    | Name with a rule beneath it.                         |
| `/organize:comments:plain`         | Just the comment character and the name.             |
| `/organize:comments:minimal`       | Single-line divider headers.                         |
| `/organize:comments:trailing-rule` | Name flush-left with a rule trailing to width.       |
