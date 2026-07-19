# format-all-languages

A `PostToolUse` hook that formats each file Claude writes with [Prettier](https://prettier.io/), dispatching by extension.

## How it works

Wired to `Write`, `Edit`, and `MultiEdit` in `settings.json`, right after `prettify-md-tables` and before `stage-edited-file` so the staged copy already carries the formatting. It rewrites the edited file in place with `prettier --write` when the extension is one Prettier handles natively:

| Extension                  | Parser     |
|----------------------------|------------|
| `.md` `.markdown`          | markdown   |
| `.js` `.jsx` `.mjs` `.cjs` | babel      |
| `.ts` `.tsx`               | typescript |
| `.json`                    | json       |
| `.css` `.scss`             | css / scss |
| `.html`                    | html       |
| `.yml` `.yaml`             | yaml       |

Any other extension is a clean skip, so the hook never spawns `npx` for files Prettier does not cover.

Prose is formatted with `--prose-wrap never`, so it stays on a single line and relies on the editor's soft wrap. This affects markdown/MDX paragraphs and YAML block scalars (`>` and `|`); it has no effect on JSON, JS, TS, or CSS.

Unlike `lint-all-languages`, this hook never blocks Claude: it always exits 0. A missing Prettier, a parse error, or any other failure is swallowed, leaving the file untouched. A formatter should reshape working code, not reject an edit. The 10s timeout in `settings.json` caps runtime.

## Installing Prettier

The hook runs `npx --no-install prettier`, so it uses a global or project-local Prettier but never triggers a network install. Install whichever suits you:

```sh
npm install -g prettier
```

A per-project `.prettierrc` (and `.prettierignore`) in the file's directory tree is picked up automatically, so project style wins over Prettier defaults.
