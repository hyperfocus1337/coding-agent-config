# Replacing Prettier with oxfmt in the format hooks, and formatters for the other file types (October 2026)

Keep Prettier in `format-prettier` for now. oxfmt 0.74.0 formats every file type that the hook formats today, including Markdown, and on this repository its output is the same as Prettier's on 349 of 365 files. But oxfmt does not read `.prettierrc`, it uses a print width of 100 when no oxfmt config exists, its Markdown formatter is 17 days old, and it changes the text of 15 slash-command front matter blocks. The hook runs in every repository that an agent edits, so these differences reformat other projects against their own Prettier config, and the time saved is about 0.5 s for each session. Move to oxfmt when the conditions in [When to migrate](#when-to-migrate) are true, with the plan in [Migration plan](#migration-plan).

## TL;DR

- **oxfmt now covers Markdown.** Since oxfmt 0.72.0 (2026-10-05), a native Rust formatter formats Markdown. YAML has been native since 0.62.0 (2026-08-03). HTML, Vue, MDX, and some other languages go to a bundled Prettier 3.9.9, which only the npm package has.\[3\]\[8\]\[11\]\[12\] So no second formatter is necessary to cover the types that the hook formats today.
- **Output on this repository (verified locally):** of 229 Markdown files, 214 are identical to Prettier 3.9.9. The 15 others all differ for one reason: oxfmt adds a comma inside an `argument-hint: [...]` front matter value, which changes the hint text. Of 98 TypeScript files, 1 differs. All 29 JSON files that parse and all 6 YAML files are identical.
- **Speed (verified locally, one Markdown file, Apple M1 Pro):** Prettier 146 ms, oxfmt npm package 65 ms, oxfmt standalone binary 5.2 ms. The Prettier run is about 0.6 s of the 5.7 s that `format-prettier` costs in each session. The git sweep of Bash calls costs the rest, see [`docs/hooks/performance/`](../../hooks/performance/README.md).
- **Blockers for a global hook:** oxfmt reads `.oxfmtrc.json` and `oxfmt.config.ts`, not `.prettierrc`.\[4\] With no oxfmt config, the print width is 100 and not 80.\[5\] It is 0.x beta, with a release each week and breaking changes in 0.72.0 and 0.73.0.\[8\]\[9\]
- **If you need a Markdown formatter other than Prettier or oxfmt:** the dprint Markdown plugin is closest to Prettier on this repository (3 files differ), and `rumdl fmt` with only rule MD060 aligns tables with 0 differences in 6.4 ms but does not normalize other syntax. Biome 2.6.2 (1 day old) changes 117 files, and deno fmt and the default `rumdl fmt` change the text inside code spans.
- **TOML is new work, not a gap.** Prettier does not format TOML today. oxfmt, taplo, and tombi can, but in this chezmoi repository 2 of the 4 `.toml` files are templates or scripts that no TOML parser accepts.

## Key findings

1. **oxfmt is beta, at 0.74.0, and releases each week.** The Oxc blog announced "Oxfmt Beta" on 2026-02-24, and the GitHub milestone "Oxfmt Beta" closed on 2026-02-25.\[7\]\[16\] No 1.0 release or "stable" label exists. The open milestones are "Oxfmt Q2" and "Oxfmt Q3". npm shows 15 releases from 0.60.0 (2026-07-21) to 0.74.0 (2026-10-19), one each week.\[1\] Releases 0.72.0 and 0.73.0 both list breaking changes.\[8\]\[9\]
2. **Most languages are native, a few go to a bundled Prettier.** The language support page lists JS, JSX, TS, TSX, JSON, JSONC, JSON5, CSS, SCSS, Less, GraphQL, TOML, YAML, and Markdown as native. HTML, Angular, Vue, Svelte, Astro, MDX, Handlebars, and MJML are "Delegated to the bundled Prettier", and "the standalone GitHub Releases binary skips these files".\[3\] Verified locally: the standalone binary formatted a `.md` and a `.css` file and skipped a `.html` file with exit 0. The npm package formatted the same HTML file and gave output identical to Prettier 3.9.10.
3. **Prettier compatibility is high, and measured.** The beta post says oxfmt "passes 100% of Prettier's JavaScript and TypeScript conformance tests".\[7\] The conformance snapshot in the oxc repository (commit of 2026-10-22) gives, at `printWidth: 80`: Markdown 273 of 283 (96.47 %), Markdown from mdn-content 360 of 362, YAML 301 of 302, CSS 221 of 221, SCSS 203 of 217, Less 403 of 409.\[15\] The docs say the output "is closest to Prettier v3.9.9", and each language has a `DIVERGENCES.md` that lists the intentional differences.\[4\]\[13\]\[14\]
4. **oxfmt does not read Prettier config.** `oxfmt --migrate prettier` converts a Prettier config to `.oxfmtrc.json`, and supports only JSON and JS configs, not YAML, JSON5, or TOML.\[4\] Prettier plugins are not supported, but oxfmt has its own import sort, Tailwind class sort, and `package.json` sort.\[2\]\[4\] Verified locally: in a folder with `.prettierrc.json` set to `singleQuote: true`, oxfmt kept double quotes and printed "No config found, using defaults", and kept a 98-character line that Prettier broke into 6 lines.
5. **The defaults differ from Prettier in two places that matter here.** `printWidth` is 100 (Prettier: 80), and `sortPackageJson` is on.\[5\] `proseWrap` takes `always`, `never`, or `preserve`, with `preserve` as the default, so the one-line paragraphs that `writing.md` asks for stay on one line.\[5\] Verified locally: a 170-character paragraph line and a paragraph wrapped by hand over 2 lines both stayed as written.
6. **The CLI fits a hook, with three differences from Prettier.** `--write` is the default mode, `--check` and `--list-different` exist, and `--ignore-path` defaults to `.gitignore` and `.prettierignore` in the current folder.\[6\] Verified locally, with 0.74.0:
   - `--ignore-path .prettierignore` with no `.prettierignore` in the folder exits 1 and formats nothing. Prettier accepts a missing ignore file.
   - A file named on the command line that `.gitignore` lists is formatted. Prettier skips it with exit 0, which is why the hook passes `--ignore-path` today. A file that `.prettierignore` lists is still skipped.
   - A file that does not parse gives exit 2, and oxfmt still formats the other files of the run. A run where all named files are ignored or unsupported also gives exit 2.
   - `--stdin-filepath` works in the npm package and fails in the standalone binary with "`--stdin-filepath` is not expected in this context".
7. **oxfmt changes front matter that is not valid YAML.** 15 command files in `dot_claude/commands/` have front matter such as `argument-hint: [question | keep [question]]`, which go-yaml (`yq`) rejects as YAML. Prettier keeps it as written, but oxfmt 0.74.0 rewrites it to `[question | keep, [question]]`, which changes the hint text. The YAML `DIVERGENCES.md` does not list this, and no oxc issue for it was found.\[14\] If the value is in quotes, oxfmt keeps it (verified locally). Vale also stops on these values, so `lint-prose` already blanks the front matter before Vale reads a file (`dot_claude/hooks/lint-prose/docs/implementation.md`, "Frontmatter").
8. **Biome 2.6.2 formats Markdown and YAML, but the Markdown formatter is new.** Biome 2.6.2 (2026-10-21) adds Markdown with a `proseWrap` option (default `preserve`) and claims "more than 90%" Prettier compatibility.\[21\] The same release notes say "GitHub Flavored Markdown (GFM) aren't currently supported", while the language support page says Biome "supports the CommonMark specification plus GitHub-Flavored Markdown by default".\[20\]\[21\] Verified locally: it aligned GFM tables, but it removed the blank line between a paragraph and the list after it in 117 of 229 files. Front matter needs `markdown.parser.frontmatter: true`, and HTML formatting is experimental.\[22\]
9. **deno fmt and dprint share one Markdown engine, with different versions.** deno fmt is "based on dprint", formats Markdown, YAML, JSON, CSS, and HTML, does not format TOML, and defaults to `--prose-wrap always`.\[30\] Verified locally: deno 2.9.7 removed the spaces at the edges of code spans, so `` `@folder/ ` `` became `` `@folder/` `` in a document that is about that trailing space. The dprint Markdown plugin 0.27.1 did not do this.
10. **Most Markdown "fixers" change content, not only layout.** `rumdl fmt` with its default rules and `markdownlint-cli2 --fix` apply lint fixes: they remove the `$ ` prompt from shell examples (MD014), remove spaces in code spans (MD038), and add `text` to code fences without a language. rumdl table alignment (MD060) is opt-in. The rumdl docs say MD060 is designed to match Prettier's table format.\[27\]

## Comparison table

Diffs are against the repository at `1fd9bcf`, after a Prettier 3.9.9 pass, on copies under `/tmp`. Latency is the mean of 30 `hyperfine` runs on `dot_claude/hooks/format-prettier/README.md` (20 KB), already formatted, on an Apple M1 Pro with macOS 27.0.1. "npm launcher" is the Node script that the npm package puts on `PATH`. "native" is the platform binary that the launcher starts.

| Tool and version tested                       | Latest release (date)      | License           | Runtime                          | Hook types it formats                                 | Markdown files changed (of 229)    | Markdown latency                   | Markdown prose wrap                     |
| --------------------------------------------- | -------------------------- | ----------------- | -------------------------------- | ----------------------------------------------------- | ---------------------------------- | ---------------------------------- | --------------------------------------- |
| Prettier 3.9.9 (installed)                    | 3.9.10 (2026-10-10)        | MIT               | Node                             | All                                                   | 0 (baseline); 3.9.10 also 0        | 146 ms                             | `preserve`, `always`, `never`           |
| oxfmt 0.74.0, npm                             | 0.74.0 (2026-10-19)        | MIT               | Node launcher and native binding | All, HTML through bundled Prettier 3.9.9              | 15, one cause (front matter)       | 65 ms                              | `preserve` (default), `always`, `never` |
| oxfmt 0.74.0, standalone binary               | same                       | MIT               | One native binary, 5.7 MB        | All except HTML                                       | 15, same as npm                    | 5.2 ms                             | same                                    |
| Biome 2.6.2                                   | 2.6.2 (2026-10-21)         | MIT or Apache-2.0 | One native binary                | JS, TS, JSON, CSS, YAML, Markdown; HTML experimental  | 117                                | 68 ms npm launcher, 11.8 ms native | `preserve` (default), `always`, `never` |
| dprint 0.64.1, markdown plugin 0.27.1         | 0.64.1 (2026-10-20)        | MIT               | Native binary and Wasm plugins   | All, with 6 plugins (JSON, YAML, TOML, CSS, HTML, MD) | 3                                  | 130 ms                             | `maintain` (default), `always`, `never` |
| deno fmt 2.9.7                                | 2.9.8 (2026-10-21)         | MIT               | One native binary, 100+ MB       | All except TOML                                       | 12, changes code span text         | 30 ms                              | `always` (default), `preserve`, `never` |
| rumdl 0.3.0 `fmt`, default rules              | 0.3.0 (2026-10-17)         | MIT               | One native binary                | Markdown only                                         | 30, lint fixes that change content | 80 ms npm launcher, 6.4 ms native  | No reflow unless MD013 reflow is on     |
| rumdl 0.3.0 `fmt --enable MD060`              | same                       | MIT               | same                             | Markdown tables only                                  | 0                                  | 6.4 ms native                      | No reflow                               |
| mdformat 0.7.22 with gfm, frontmatter plugins | 1.0.0 (2025-10-16)         | MIT               | Python                           | Markdown only                                         | 16 with `--number`, 66 without     | 141 ms                             | `--wrap keep` (default), `no`, a number |
| remark-cli 12.0.1 with remark-gfm             | 12.0.1 on npm              | MIT               | Node                             | Markdown only                                         | 22                                 | 208 ms                             | No reflow                               |
| markdownlint-cli2 0.24.0 `--fix`              | 0.24.0 on npm (2026-10-21) | MIT               | Node                             | Markdown lint fixes, not a formatter                  | 14, lint fixes that change content | not measured                       | Not a formatter                         |
| yamlfmt 0.21.0                                | 0.21.0 (2026-01-05)        | Apache-2.0        | One native binary                | YAML only                                             | 1 of 4 `.yml`: removes blank lines | 17 ms (YAML)                       | Not applicable                          |
| taplo 0.10.0                                  | 0.10.0 (2025-05-23)        | MIT               | One native binary                | TOML only                                             | 0 of the 2 `.toml` that parse      | 18 ms (TOML)                       | Not applicable                          |
| tombi 1.9.0                                   | 1.9.0 (2026-10-22)         | MIT               | One native binary                | TOML only                                             | 1 of the 2 `.toml` that parse      | 16 ms (TOML)                       | Not applicable                          |

On the other types, verified locally: oxfmt, dprint, Biome, and deno fmt left all 6 YAML files as Prettier did. oxfmt left all 29 JSON files that parse as Prettier did, and changed 1 of 98 TypeScript files (`scripts/extensions/hooks/perf.ts`: 2 union types in an `as` cast). The 2 chezmoi `modify_*.json` scripts are shell, and every formatter, also Prettier, fails on them and leaves them as they are. The oxfmt binary took 4.9 ms on one TOML file and on one YAML file.

### Markdown style knobs

| Tool             | List marker            | Emphasis and strong          | Ordered list numbers       | Tables                                                       | Code blocks in Markdown                 | Hard line break             |
| ---------------- | ---------------------- | ---------------------------- | -------------------------- | ------------------------------------------------------------ | --------------------------------------- | --------------------------- |
| Prettier         | `-`, no option         | `_` and `**`, no option      | Keeps `1. 1.` or `1. 2.`   | Aligned, no option                                           | Formatted (embedded)                    | Kept as written             |
| oxfmt            | Same as Prettier       | Same as Prettier             | Same as Prettier           | Same as Prettier                                             | Formatted, `embeddedLanguageFormatting` | Kept as written             |
| Biome 2.6.2      | `-` (observed)         | `_` and `**` (observed)      | Kept (observed)            | Aligned, 1 column wider in 1 file                            | Formatted, `formatEmbeds`               | Kept as written             |
| dprint markdown  | `list.unorderedMarker` | `emphasisKind`, `strongKind` | Kept (observed)            | Aligned, short delimiter `-` for a 1-character column        | Only with a plugin for the language     | Backslash (`hardBreakKind`) |
| rumdl fmt        | MD004 style            | MD049 and MD050 styles       | MD029 style                | MD060, opt-in                                                | Not formatted                           | Kept as written             |
| mdformat         | `-`                    | Keeps `*` and `__`           | All `1.` unless `--number` | Aligned, with mdformat-gfm                                   | Only with code formatter plugins        | Backslash                   |
| remark-stringify | `bullet`               | `emphasis`, `strong`         | Renumbers                  | Aligned, with remark-gfm; other padding for centered columns | Not formatted                           | Backslash                   |

## Per-file-type recommendation

| File type the hook formats today           | oxfmt 0.74.0 coverage                    | Pick now | Pick after migration                   | Other candidates                                                                                                |
| ------------------------------------------ | ---------------------------------------- | -------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.md` `.markdown`                          | Native since 0.72.0                      | Prettier | oxfmt                                  | dprint markdown (closest, 3 files). `rumdl fmt --enable MD060` for tables only. Not Biome 2.6.2 or deno fmt yet |
| `.js` `.jsx` `.mjs` `.cjs`                 | Native                                   | Prettier | oxfmt                                  | Biome                                                                                                           |
| `.ts` `.tsx` `.mts` `.cts`                 | Native                                   | Prettier | oxfmt                                  | Biome                                                                                                           |
| `.json`                                    | Native, also `.jsonc` and `.json5`       | Prettier | oxfmt                                  | Biome, dprint json                                                                                              |
| `.css` `.scss`                             | Native, also `.less`                     | Prettier | oxfmt                                  | dprint malva, Biome (CSS)                                                                                       |
| `.html`                                    | Bundled Prettier 3.9.9, npm package only | Prettier | oxfmt npm package, or keep Prettier    | Biome (experimental), dprint markup_fmt                                                                         |
| `.yml` `.yaml`                             | Native since 0.62.0                      | Prettier | oxfmt                                  | dprint pretty_yaml, Biome 2.6.2, yamlfmt with `retain_line_breaks: true`                                        |
| `.toml` (not formatted today)              | Native                                   | None     | oxfmt, if the hook skips chezmoi files | tombi (active), taplo (last release 2025-05-23)                                                                 |
| `.org` (`format-org-tables`, not Prettier) | No                                       | Emacs    | Emacs                                  | None                                                                                                            |

An umbrella tool other than oxfmt does not fit better. dprint covers all types with Wasm plugins, but at 130 ms it was not faster than Prettier here, and it needs 6 plugin entries in a config. Biome covers most types, but its Markdown and YAML formatters are 1 day old and changed 117 Markdown files. deno fmt is fast, but changes code span text and does not format TOML.

## When to migrate

Move `format-prettier` to oxfmt when all of these are true:

- oxfmt reads Prettier config, or the hook finds a way to keep Prettier for each repository that has a Prettier config. Without one of these, each JS or TS edit in a repository with a `.prettierrc` gets the oxfmt defaults.
- The Markdown formatter has several releases with no breaking change. It became the default for Markdown in 0.72.0 on 2026-10-05.\[8\]
- The front matter change in finding 7 is fixed upstream, or the 15 `argument-hint` values are in quotes.

The time saved alone does not justify a migration. With 4.6 Prettier runs in an average session (3.9 Bash sweeps that found Markdown, 0.5 Edit, 0.2 Write), the npm package saves about 0.4 s and the binary about 0.6 s, of the 15.2 s that all Claude Code hooks cost in each session.

## Migration plan

The steps for when the conditions above are true. One core serves Claude Code, pi, omp, Codex, and the `format-staged-files` pre-commit hook, so a change in `core.ts` reaches all of them at the same time, and the agent hook and the pre-commit hook cannot format a file in two different ways.

1. **Now, with no migration:** put the 15 `argument-hint` values in quotes, for example `argument-hint: "[question | keep [question]]"`. The files are in `dot_claude/commands/answer/` (7), `dot_claude/commands/code/explain.md`, `dot_claude/commands/code/review/` (5), and `dot_claude/commands/code/security/` (2). Quotes make the values valid YAML, and Prettier and oxfmt both keep them.
2. **Install oxfmt** with a pinned version: `mise use -g npm:oxfmt@0.74.0` (the `mise` registry maps `oxfmt` to `npm:oxfmt`), or `brew install oxfmt`, which depends on Node and so is the npm package. Use the standalone binary from the GitHub release only if the hook keeps Prettier for `.html`.
3. **Add `.oxfmtrc.json`** with `{ "printWidth": 80 }` at the root of this repository. This repository has no Prettier config, so `oxfmt --migrate prettier` has nothing to convert.
4. **Change `dot_claude/hooks/format-prettier/core.ts`:**
   - Run `oxfmt --write <files>`, and remove `--prose-wrap preserve` (the default) and `--ignore-path .prettierignore` (exits 1 when the file is missing, and no longer necessary, see finding 6).
   - Use oxfmt only for a file that has an oxfmt config in its folder tree, and Prettier for all other files. This keeps the style of other projects. A `shortcut:` comment names the limit: one formatter for each run.
   - Change the amend hint text, which names Prettier.
   - Optionally add `.jsonc`, `.json5`, `.less`, and `.toml` to `EDITED`. A chezmoi `modify_` script or `.tmpl` file does not parse, so oxfmt leaves it as it is, and the hook fails open.
5. **Tests:** `dot_claude/hooks/format-prettier/test/check.ts` and `dot_config/git/hooks/format-staged-files/test/check.ts` require `prettier` on `PATH`. Add `oxfmt`, and a case for the oxfmt config lookup.
6. **Performance script:** in `scripts/extensions/hooks/perf.ts`, add `oxfmt` to `WRITERS` (line 528), to the `mtime` check (line 648), and to the `format-prettier` row (line 676). Then run `just hooks-perf`.
7. **Docs:** update `dot_claude/hooks/format-prettier/README.md` (requirements, command, "Prettier's own ignore rules"), `docs/implementation.md`, `docs/testing.md`, the row in `dot_claude/hooks/README.md`, the oxfmt row in `docs/hooks/ideas.md`, and add a decision to `docs/hooks/decisions.md`.
8. **Name (optional):** [`decisions.md`](../../hooks/decisions.md) says each hook name says what it covers. A rename of `format-prettier` changes `dot_claude/settings.json.tmpl`, `dot_codex/modify_hooks.json` (lines 22, 52, and the `SessionStart` message at line 126), `dot_pi/agent/modify_settings.json`, `dot_omp/private_agent/private_config.yml`, `dot_claude/hooks/toggle-hook/core.ts` and its README and test, the formatter list in `dot_config/git/hooks/format-staged-files/main.ts`, the `plugin.json`, the git config key `agent-hook.format-prettier.enabled`, and the `AGENT_HOOKS_DISABLE` value. Each changed Codex entry must be trusted again in the Codex TUI.

### Risks

- **Churn in this repository:** 16 files change on the first run: the 15 command files (none after step 1) and `perf.ts`.
- **Churn in other repositories:** without the config check of step 4, each edited JS, TS, CSS, or JSON file in a project with a Prettier config gets width 100 and default options. A `prettier --check` in the CI of that project then fails.
- **Formatter conflicts:** the agent hook and the pre-commit hook run the same `command.ts`, so they agree. A conflict can come from an editor or CI that runs Prettier on the same files. In this repository, that affects the files in the first risk only.
- **Version churn:** oxfmt releases each week, with breaking changes in 2 of the last 3 minor versions. Pin it, and read the release notes before an upgrade.
- **Agent parity:** no extra risk. Claude Code, pi, omp, and Codex all run `core.ts`. Codex needs a new trust only if its command line changes.

## How the local checks ran

All tools ran on copies of the repository at `1fd9bcf` in `/tmp/agent-scratch/oxfmt-research/`, never on the working tree. The copy got a Prettier 3.9.9 pass first (`--prose-wrap preserve`), which changed 13 TypeScript files under `dot_pi/agent/extensions/` and no Markdown, JSON, or YAML file, so the copy is a clean Prettier baseline. Each tool then ran in its own git worktree of that baseline, and `git diff --shortstat` measured the change. The configs: oxfmt `{ "printWidth": 80 }`; Biome `lineWidth: 80`, `markdown.parser.frontmatter: true`, `proseWrap: preserve`; dprint `lineWidth: 80`, `textWrap: maintain`; deno `--prose-wrap=preserve`; mdformat `--wrap keep`; remark with `bullet: "-"`, `emphasis: "_"`, `strong: "*"`. Claims without "verified locally" come from the sources below.

## Caveats

- The conformance figures are from the oxc snapshot on `main` at 2026-10-22, which can be newer than 0.74.0.\[15\]
- Biome's two sources disagree on GFM support. The local test used tables only, not task lists, footnotes, or strikethrough.\[20\]\[21\]
- mdformat 0.7.22 was tested because the plugin set pinned it. mdformat 1.0.0 is the latest release and can give different output.
- The dprint latency includes the start of 6 Wasm plugins. A config with only the Markdown plugin can be faster. This was not measured.
- The session saving uses the run data in [`docs/hooks/performance/`](../../hooks/performance/README.md) (2026-10-20 to 2026-10-21) and the one-file latencies above. It does not include runs on many files.
- Claude Code's handling of the unquoted `argument-hint` values was not tested. The change in finding 7 is a change of the file text, and the effect in the command picker is not known.

## Sources

1. [oxfmt - npm](https://www.npmjs.com/package/oxfmt)
2. [Formatter (Oxfmt) | Oxc](https://oxc.rs/docs/guide/usage/formatter)
3. [Language support | Oxc](https://oxc.rs/docs/guide/usage/formatter/language-support)
4. [Migrate from Prettier | Oxc](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier.html)
5. [Config file reference | Oxc](https://oxc.rs/docs/guide/usage/formatter/config-file-reference)
6. [CLI | Oxc](https://oxc.rs/docs/guide/usage/formatter/cli)
7. [Oxfmt Beta | Oxc blog, 2026-02-24](https://oxc.rs/blog/2026-02-24-oxfmt-beta)
8. [oxfmt v0.72.0 release notes](https://github.com/oxc-project/oxc/releases/tag/oxfmt_v0.72.0)
9. [oxfmt v0.73.0 release notes](https://github.com/oxc-project/oxc/releases/tag/oxfmt_v0.73.0)
10. [oxfmt v0.74.0 release notes and binaries](https://github.com/oxc-project/oxc/releases/tag/oxfmt_v0.74.0)
11. [oxfmt v0.71.0 release notes (bundled Prettier 3.9.9)](https://github.com/oxc-project/oxc/releases/tag/oxfmt_v0.71.0)
12. [oxlint v1.77.0 and oxfmt v0.62.0 release notes (native YAML)](https://github.com/oxc-project/oxc/releases/tag/apps_v1.77.0)
13. [oxc_formatter_markdown DIVERGENCES.md](https://github.com/oxc-project/oxc/blob/main/crates/oxc_formatter_markdown/DIVERGENCES.md)
14. [oxc_formatter_yaml DIVERGENCES.md](https://github.com/oxc-project/oxc/blob/main/crates/oxc_formatter_yaml/DIVERGENCES.md)
15. [oxfmt conformance snapshot](https://github.com/oxc-project/oxc/blob/main/apps/oxfmt/conformance/snapshots/conformance.snap.md)
16. [oxc-project/oxc milestones](https://github.com/oxc-project/oxc/milestones?state=closed)
17. [CLI | Prettier](https://prettier.io/docs/cli)
18. [Options: Prose Wrap | Prettier](https://prettier.io/docs/options#prose-wrap)
19. [Prettier 3.9.10 release](https://github.com/prettier/prettier/releases/tag/3.9.10)
20. [Language support | Biome](https://biomejs.dev/internals/language-support/)
21. [Biome CLI v2.6.2 release notes](https://github.com/biomejs/biome/releases/tag/%40biomejs%2Fbiome%402.6.2)
22. [Configuration reference | Biome](https://biomejs.dev/reference/configuration/)
23. [dprint-plugin-markdown](https://github.com/dprint/dprint-plugin-markdown)
24. [dprint plugin index](https://plugins.dprint.dev/info.json)
25. [dprint 0.64.1 release](https://github.com/dprint/dprint/releases/tag/0.64.1)
26. [g-plane/pretty_yaml](https://github.com/g-plane/pretty_yaml)
27. [MD060 table format | rumdl](https://rumdl.dev/md060/)
28. [rumdl v0.3.0 release](https://github.com/rvben/rumdl/releases/tag/v0.3.0)
29. [mdformat | PyPI](https://pypi.org/project/mdformat/)
30. [deno fmt | Deno docs](https://docs.deno.com/runtime/reference/cli/fmt/)
31. [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)
32. [remark](https://github.com/remarkjs/remark)
33. [taplo 0.10.0 release](https://github.com/tamasfe/taplo/releases/tag/0.10.0)
34. [tombi v1.9.0 release](https://github.com/tombi-toml/tombi/releases/tag/v1.9.0)
35. [yamlfmt v0.21.0 release](https://github.com/google/yamlfmt/releases/tag/v0.21.0)
36. [oxfmt | Homebrew formulae](https://formulae.brew.sh/formula/oxfmt)
