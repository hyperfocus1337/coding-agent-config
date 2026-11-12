# tools-collapse

Hides successful tool previews with Pi 1.5's `registerToolRenderer()` API. Inspired by [pi-collapse-tools](https://github.com/xRyul/pi-collapse-tools), but does not replace tools or change their execution.

- Applies to `bash`, `powershell`, `read`, `write`, `edit`, `grep`, `find`, `ls`, and `codemode`.
- Keeps native command and search headers. Collapsed writes and edits show the tool name and path, without code or diffs.
- Codemode hides the script and returned output, but keeps Pi's nested-call rows, status, arguments, timing, costs, and elapsed timer.
- Errors use the native renderers, even when collapsed. Expand with Pi's configured tool-expansion keybinding, `Ctrl+O` by default, to see native content.
- Leaves third-party tool renderers unchanged. Does not enable inactive tools or change arguments, results, shell settings, session history, or model context.

With [`tool-overview`](../tool-overview/README.md), the batch overview controls visibility. An open batch shows native tool content; a closed batch still shows its failure count. The `tools-collapse` directory follows `tool-overview` in Pi's auto-discovery order, so the batch renderer wraps this renderer. If loading extensions through an explicit list, put `tool-overview` first.

## Migration

Replaces `compact-bash`. The old extension and its `PI_COMPACT_BASH` switch are removed. Chezmoi removes the old deployed directory on apply. Reload Pi after applying.

No settings, commands, startup notices, extra model requests, custom animations, token estimates, or copied tool implementations are included.

## Checks

```sh
just pi-check
```

The check loads the extension through installed Pi, exercises all supported native renderers, checks errors and repeated expansion, verifies codemode rows and timing, and tests composition with `tool-overview`. No model calls are made.
