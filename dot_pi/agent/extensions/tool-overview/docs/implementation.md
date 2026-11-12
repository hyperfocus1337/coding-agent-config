# Implementation

## Scope

`index.ts` registers a tool-renderer resolver and observes message, tool, turn, and session events. `summary.ts` bounds evidence, validates generated text, and formats fallback text and durations. No tool is registered or wrapped for execution, and no conversation or provider hook changes model input.

Assistant message events establish batch membership before Pi creates the corresponding tool rows. Tool lifecycle events update arguments, completion counts, failures, and wall-clock duration. Nested lifecycle events are ignored because Pi draws those calls inside their parent. A one-second timer refreshes the active batch and stops when its calls finish, its turn ends, the agent settles, or the session shuts down.

## Rendering

Each tool's existing renderer comes from the resolver's `next()`. The first call draws the batch header. Collapsed siblings return empty components under `renderShell: "self"`, which Pi renders without blank rows. Expansion delegates call and result rendering to the existing renderer. Generic tools without renderer slots use text fallbacks.

Pi still draws image results outside these slots.

The resolver keeps delegated components apart from wrapper components so a native renderer never receives a `Container` where it expects its own cached component. Native result renderers run even while hidden to retain their final-render cleanup. Invalidation callbacks are indexed by call ID, not accumulated on every render. A click refreshes all rows of its batch. Changes to Pi's global expansion setting clear each batch's local override.

## Summaries and persistence

At `turn_end`, completed batches call `ctx.modelRegistry.streamSimple()` once with the current model. Only bounded tool evidence is supplied. The request uses the current abort signal, a session-owned abort controller, and a 20-second deadline. Errors leave a deterministic count-based sentence. Session shutdown cancels outstanding work and prevents stale receipts from being appended.

`pi.appendEntry("tool-overview", ...)` saves call IDs, summary text, elapsed time, fallback status, and returned usage without adding LLM context. Restoring reads only the active branch. It rebuilds batches from assistant tool calls and tool results, then applies saved receipts. It does not request summaries for historical calls. The extension does not add summary usage to Pi's native totals.

The summary prompt follows the supplied screenshot. Word count and numeric checks are mechanical guards, not a factual or grammatical proof. Evidence caps are intentional; chunked summarization and extra model selection are not implemented.

## Reference

[pi-tool-display-intent](https://github.com/zhcsyncer/pi-extensions/tree/main/packages/pi-tool-display-intent) supplied the layout idea: a live count, duration, and an expandable timeline. This extension does not copy its implementation, intent fields, settings interface, or older Pi hooks. The installed Pi extension and TUI documentation define the APIs used here.
