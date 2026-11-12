# Implementation

## Renderer composition

Pi 1.5's `registerToolRenderer((name, next) => ...)` changes presentation without registering a replacement tool. Resolve `next()` first and wrap only the supported tool names with an existing result renderer. Keep the native shell mode and leave third-party renderers unchanged. There is no execution wrapper, CLI parsing, settings reader, or result event handler.

Each resolver keeps native call and result components in a `WeakMap` keyed by Pi's row state. The compact header and empty result must not become the native renderer's `lastComponent`: native slots can require different component classes. The weak keys let Pi release old rows without extension cleanup.

Always invoke native renderers, even when their output is hidden. The edit result renderer updates its call component, and bash, PowerShell, and codemode result renderers stop their timers on completion. No extension timer is needed.

## Collapsed display

Keep native call headers except for edit, write, and codemode, whose call renderers contain previews. These three use a compact `Text` header; paths have terminal sequences and control characters removed. Expanded or failed calls use native headers.

Hide successful built-in result components with an empty `Container`. For codemode, pass a shallow display copy with empty `content` to the native result renderer instead. This keeps native nested-call details and timer handling while hiding script output. The actual result remains unchanged. Native errors and expanded rendering receive the original result.

Pi's own image handling remains in control; this extension does not change image settings. Native preview and nested-call limits also remain in control.

## Batch integration

Pi resolves renderer hooks in extension load order. `tool-overview` must come before `tools-collapse`, so its batch wrapper can pass the batch's expanded state into this renderer. The normal directory names provide that order. A closed batch hides its tools and shows its failure count; an open batch sets `expanded` on both native slots.

## References

- Pi 1.5 `docs/extensions.md`: `pi.registerToolRenderer()` and custom rendering.
- Pi 1.5 `docs/tui.md`: built-in components and empty containers.
- Pi's `dist/extensions/codemode/renderer.js`: native call rows and timer behavior.
- [pi-collapse-tools](https://github.com/xRyul/pi-collapse-tools): behavior comparison only; no source copied.
