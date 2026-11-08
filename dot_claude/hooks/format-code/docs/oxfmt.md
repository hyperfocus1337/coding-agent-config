# oxfmt in format-code

[`formatters/oxfmt.ts`](../formatters/oxfmt.ts) formats the JavaScript, TypeScript, JSON, CSS, HTML, YAML, TOML, and Markdown files of a call with [oxfmt](https://oxc.rs/docs/guide/usage/formatter). It runs after each tool call, so the model reads back formatted files and Markdown tables stay aligned while the model edits them. The [README](../README.md) tells what the hook does for each formatter. This file gives what is different for oxfmt.

oxfmt replaced Prettier on 2026-10-25, as the separate hook `format-oxfmt`, see [format-oxfmt replaces format-prettier](../../../../docs/hooks/decisions.md#format-oxfmt-replaces-format-prettier). On 2026-11-08 it moved into `format-code`. The research for the move to oxfmt is in [`oxfmt-and-prettier-alternatives.md`](../../../../docs/research/formatting/oxfmt-and-prettier-alternatives.md).

## Supported extensions

| Extensions                                                   | Note                                                |
| ------------------------------------------------------------ | --------------------------------------------------- |
| `.md`, `.markdown`                                           | Native Markdown formatter since oxfmt 0.72.0        |
| `.js`, `.jsx`, `.ts`, `.tsx`, `.mts`, `.cts`, `.mjs`, `.cjs` |                                                     |
| `.json`, `.jsonc`, `.json5`                                  |                                                     |
| `.css`, `.scss`, `.less`                                     |                                                     |
| `.yml`, `.yaml`                                              |                                                     |
| `.toml`                                                      |                                                     |
| `.html`                                                      | oxfmt sends HTML to the Prettier in its npm package |

## Bash: Markdown only

A Write or an Edit formats each extension of the table, because the edit is the reason to format. A Bash call formats only `.md` and `.markdown`, set by `swept` in the module. A format of each changed `.ts`, `.css`, or `.json` file after each shell command would interfere with edits that are not complete. Misaligned Markdown tables are the problem that justifies a sweep after a shell command. Other files do not.

So a non-Markdown file that a shell command writes, for example with a heredoc, `jq`, or a script, stays unformatted until an Edit changes it. A `jq ... | sponge dot_claude/settings.json` edit in this repo is such a case. The file only hurts when it reaches a commit, and the [`format-staged-files`](../../../../dot_config/git/hooks/format-staged-files/README.md) pre-commit hook closes that gap: in an agent session, it runs `command.ts` on all staged files before git writes the commit, with all extensions of the table.

## Requirements

**oxfmt** on `PATH`, the npm package. The standalone binary from the GitHub release skips `.html` with exit `0`. oxfmt releases each week and has had breaking changes, so install a pinned version and read the release notes before an upgrade. With mise, as on this computer, `~/.config/mise/config.toml` holds `"npm:oxfmt" = "0.74.0"`. Without mise:

```sh
pnpm add -g oxfmt@0.74.0
```

The hook starts the `oxfmt` binary directly, as `lint-code` starts its linters. It never installs oxfmt from the network.

## One run for all files

The hook runs `oxfmt <files>` once for the files of a call, in the session folder, and stops it after 20 s. oxfmt rejects a path that holds `..`, also an absolute one, so the core removes the `.` and `..` segments of each path first. When oxfmt cannot parse a file, it exits `2` and leaves that file as it is, but it still formats the other files of the run.

## Config

oxfmt does not read `.prettierrc`. It looks for `.oxfmtrc.json`, `.oxfmtrc.jsonc`, `oxfmt.config.ts`, or `oxfmt.config.mts`, from the folder of each file up, and the nearest config wins.

With no config, oxfmt uses its defaults: a print width of 100, and it sorts the keys of `package.json`. Prettier uses 80 and does not sort. So in a project that Prettier formats with no oxfmt config, each file that the hook formats can reflow to 100 columns. To keep the Prettier style of a project, run `oxfmt --migrate prettier` in that project, which writes `.oxfmtrc.json` from a JSON or JS Prettier config. Or turn oxfmt off there with `/toggle-hook --repo format-code.oxfmt`.

`proseWrap` is `preserve` by default in oxfmt, so oxfmt keeps the line breaks that the author wrote. A paragraph on one line, as `writing.md` asks, stays on one line, and oxfmt pads each table also when it is wider than the print width.

### Why not `proseWrap` never

`proseWrap` `never` joins the lines of each paragraph into one line. It also stops oxfmt from padding a table that is wider than `printWidth` (`100` by default): the table stays in the compact `| --- |` form. Prettier did the same.

## Ignore rules

oxfmt reads `.gitignore` and `.prettierignore` in the session folder, but it formats a gitignored file that the command line names. A file that `.prettierignore` lists stays as it is. So the hook passes no `--ignore-path`. `.prettierignore` is a formatting decision, so the hook obeys it, but `.gitignore` is a version-control decision and does not apply to a file that the hook names.

oxfmt runs in the session folder: `$.session.cwd()` in the mod, `ctx.cwd` in pi, and the payload `cwd` in `command.ts`. It finds the ignore files from there, so a `.prettierignore` in a different repository does not apply to an edit in that repository. A `--ignore-path` to a file that does not exist makes oxfmt exit `1` and format nothing.

## Settings

| Setting                                         | Effect                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `git config agent-hook.format-code.oxfmt false` | Turns oxfmt off in one repository, across sessions.                 |
| `.oxfmtrc.json` and the other oxfmt configs     | The style of the project. A file with none gets the oxfmt defaults. |
| `.prettierignore`                               | oxfmt skips the files that it lists.                                |
