# prettify-md-tables

A `PostToolUse` hook that aligns markdown table columns in any `.md` or `.markdown` file after Claude writes or edits it, using [`markdown-table-prettify`](https://www.npmjs.com/package/markdown-table-prettify).

## How it works

Wired to `Write`, `Edit`, and `MultiEdit` in `settings.json`. It reads the edited file path from the tool payload and reformats only the markdown tables in it. It is surgical by design: prose and code blocks pass through unchanged, only table formatting is touched.

The hook silently no-ops on non-markdown files, malformed JSON input, or read/write errors, so a formatting hiccup never blocks a Claude tool call. Failures are swallowed and it exits 0, and the 10s timeout in `settings.json` caps worst-case runtime.

## Dependencies

This is a Node hook and declares its own `package.json` next to `hook.mjs`. After `chezmoi apply` renders it into `~/.claude`, run `npm install` in this directory (skip if `node_modules/` is already present) so `markdown-table-prettify` is provisioned. Requires `node` on `$PATH`.
