# Tool overview

Shows one collapsible overview for each assistant tool batch in Pi 1.5 or later. The layout takes inspiration from [pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent), but uses Pi's current renderer API without its code or dependencies.

```text
› Read README.md and ran the test suite.  2 calls · 47ms · ctrl+o
```

During execution, the header shows tool names, the call count, the completed count, and live elapsed time. After the batch finishes, one additional request to the current model produces a past-tense summary of at most 16 words. Each assistant response with tools is a separate batch, not the whole user request.

## Controls

- In fullscreen mode, click a header to expand or collapse that batch.
- Press `Ctrl+O`, or your configured tool-expansion key, to expand or collapse all batches. This also resets local click choices.
- Expanded batches use the existing tool renderers, including the `compact-bash` extension. Tool execution, validation, arguments, results, and model context do not change.

Only top-level calls count toward the header. Calls inside Codemode remain inside the parent's native display. Images stay visible because Pi renders them outside the tool-renderer slots. The extension does not hide assistant text or thinking blocks.

## Summary cost and limits

There is one extra model request per completed batch in interactive mode. Print, JSON, and RPC modes do not make summary requests or change rendering. The request uses the current model and authentication, so it can consume your subscription quota or incur API charges.

The summarizer receives text excerpts from tool arguments and results, not the whole conversation or image data. Evidence is limited to 16,000 characters and at most 64 calls; result excerpts are at most 2,000 characters per call. Large batches can omit evidence, which the summary instructions state. The request has a 20-second abort deadline and a 256-token output limit. Pi waits for this request before the next turn.

Summary instructions require a result-based sentence, no guessed causes, and exact numbers from the evidence. Validation rejects empty, multiline, over-16-word, control-character, and unsupported-number responses. This does not prove every generated claim is correct. Failed or invalid summaries leave a count-based overview marked `summary unavailable`. Aborted batches do not start a summary request.

Summary text, batch duration, call IDs, and returned usage are saved as custom session entries. They are not sent to the main model. Pi's native usage totals do not include these extra requests. Saved summaries return on reload, resume, and branch navigation; older batches without saved overviews show counts without an invented duration.

## Checks

Run `just pi-check`. The self-check uses the installed Pi loader and TUI with simulated model responses, not paid requests. See [implementation notes](docs/implementation.md).
