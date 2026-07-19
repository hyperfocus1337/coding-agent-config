# prettify-md-tables

A `PostToolUse` hook that aligns markdown table columns in any `.md` or `.markdown` file after Claude writes or edits it, using [`markdown-table-prettify`](https://www.npmjs.com/package/markdown-table-prettify).

## How it works

Wired to `Write`, `Edit`, `MultiEdit`, and `Bash` in `settings.json`, so it also catches markdown edited by shell commands (`sed -i`, `perl -i`, redirects) that never go through the file-editing tools. It reformats only the markdown tables it touches: prose and code blocks pass through unchanged.

Which files it formats depends on the tool that fired it:

- `Write`, `Edit`, `MultiEdit` carry the edited file path in the payload, so the hook reformats exactly that one file.
- `Bash` has no file path, so the hook asks git instead: it reformats every markdown file that changed versus `HEAD` plus any untracked new markdown in the repo. Gitignored files and anything outside a git repo are left alone.

The hook silently no-ops on non-markdown files, malformed JSON input, read/write errors, or a `Bash` call outside a git repo, so a formatting hiccup never blocks a Claude tool call. Failures are swallowed and it exits 0, and the 10s timeout in `settings.json` caps worst-case runtime.

## Tests

`test/test.sh` is a smoke test covering both dispatch paths and the edge cases. Run `bash test/test.sh`; see `test/README.md`.

## Dependencies

This is a Node hook and declares its own `package.json` next to `hook.mjs`. After `chezmoi apply` renders it into `~/.claude`, run `npm install` in this directory (skip if `node_modules/` is already present) so `markdown-table-prettify` is provisioned. Requires `node` on `$PATH`.
