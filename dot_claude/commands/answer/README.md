---
disable-model-invocation: true
---

# answer slash commands

Seven modes that change how an answer is written, and one command that clears them. Each mode stays active for every response until `/answer:reset` runs. A mode changes the shape of the answer, not the work behind it.

| Command              | Description                                                                      |
| -------------------- | -------------------------------------------------------------------------------- |
| `/answer:concisely`  | Report back extremely concisely, sacrificing grammar for the sake of concision.  |
| `/answer:caveman`    | Compressed prose: drop articles, filler, and hedging, keep every technical fact. |
| `/answer:thoroughly` | Full depth: the reasoning, the edge cases, and the rejected options.             |
| `/answer:simply`     | Plain language for a non-expert, every technical fact kept.                      |
| `/answer:sourced`    | Every claim points at `file:line`, a command output, or a document.              |
| `/answer:stepwise`   | Numbered imperative steps in the order they occur.                               |
| `/answer:tabular`    | Anything that compares items on shared attributes goes in a table.               |
| `/answer:reset`      | Clear every answer mode and return to `rules/writing.md` alone.                  |

`concisely`, `caveman`, and `simply` change the wording. `thoroughly` changes what the answer contains. `stepwise` and `tabular` change its form. `sourced` changes what a claim has to carry. Two modes that contradict each other do not stack: run `/answer:reset` between them.

Source: [Claude Code tip (YouTube Shorts)](https://youtube.com/shorts/I12Mf8KBT1I).

`/answer:caveman` condenses the [caveman plugin](https://github.com/JuliusBrussee/caveman)'s `SessionStart` instructions into 9 directives, from about 22 across 4,180 characters. The plugin is not installed, so the mode is opt-in: the command carries `disable-model-invocation: true` and costs nothing until it is invoked, and it names the `rules/writing.md` rules it overrides while active. See `docs/research/context/instruction-load.md`.
