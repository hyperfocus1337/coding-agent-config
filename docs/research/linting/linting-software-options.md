# Linting Markdown, HTML and Org mode documentation from AI coding agent hooks: tools, integration patterns and a recommended stack (September 2026)

The best stack is Vale as the single prose and paragraph-length engine for all three formats (it parses Markdown, HTML and Org natively), plus rumdl (or markdownlint-cli2) for Markdown structure, html-validate for HTML structure and org-lint in Emacs batch mode for Org structure. Run all of them from one wrapper script that each agent's post-edit hook calls, and have it return violations on stderr with exit code 2.

## TL;DR

- **Recommended stack:** Vale (MIT, single Go binary) enforces prose rules, terminology, heading case, em dash bans and a true per-paragraph word or sentence cap on Markdown, HTML and Org. As of Vale 3.21.0 (released 2026-09-09), a `metric` rule can be scoped to `paragraph`. Pair it with rumdl (MIT, Rust, 79 rules, `--fix`, native `gitlab` and `sarif` output) or markdownlint-cli2 for Markdown structure, html-validate for HTML, and org-lint via `emacs --batch` for Org.
- **Agent wiring:** Claude Code, Codex CLI and Gemini CLI can all feed lint output back to the model from a post-edit hook. For Claude Code, a `PostToolUse` hook that exits 2 surfaces stderr to Claude, and a `Stop` hook can refuse to let the turn end until docs are clean. Cursor and GitHub Copilot have hooks, but their post-edit hooks are mostly observational, so there you should autofix in the hook and gate with a stop or pre-commit and CI check.
- **Org mode is the weak spot:** only Vale and a thinly maintained textlint plugin lint Org prose natively, and no Markdown-style structural linter exists for Org besides org-lint. Plan on Vale plus org-lint with a custom checker (for example paragraph length), and treat pandoc conversion as a last resort because it loses line numbers.

## Key findings

1. **Vale is the only mature tool that covers prose rules on all three formats natively.** Its documentation lists built-in format support for Markdown, AsciiDoc, MDX, HTML, reStructuredText, XML, Org and DITA. It says "Org support is built in. The supported extension is .org."\[1\] Rules are YAML files, and the check types are existence, substitution, occurrence, repetition, consistency, conditional, capitalization, metric, spelling, sequence and script. Styles published by teams such as Google, Microsoft and Red Hat can be pulled in with `vale sync`.\[2\] The Vale README says "It's run by teams at AWS, NVIDIA, Microsoft, GitLab, and Red Hat, among others who publish their configs."
2. **Paragraph-length rules just became first-class in Vale.** Vale's own v3.21.0 release notes (released 2026-09-09) say "A `metric` rule with a scope now measures each block the scope names, so a section can have a word budget." The izkreny/agentifico tracker (issue #129) confirms that Vale 3.20.0 could not scope a `metric` rule and that 3.21.0 also added a `doc(...)` CSS-style selector. With 3.21+, `extends: metric`, `scope: paragraph`, `formula: words` counts words per paragraph.\[3\] The older workaround is an `occurrence` rule that counts word tokens per paragraph.\[4\]
3. **rumdl is now the strongest Markdown structural linter for hooks.** It is a single Rust binary that installs via cargo, pip, Homebrew, mise or nix, and it reads existing markdownlint configs.\[5\]\[6\] It has 79 rules, `--fix`, and output formats `text`, `full`, `concise`, `grouped`, `json`, `json-lines`, `sarif`, `junit`, `github`, `gitlab`, `azure` and `pylint`.\[7\]\[8\] It is still labelled Beta, "while its compatibility policy and 1.0 exit criteria are formalized".\[9\] It shows heavy release activity (385 releases, the latest on 2026-09-11) and has no plugin API for custom rules, so custom rules belong in Vale.\[10\]
4. **markdownlint-cli2 remains the most extensible Markdown structural linter.** Custom rules are written in JavaScript, and output formatters include JSON and a GitLab Code Quality formatter (`markdownlint-cli2-formatter-codequality`).\[11\]\[12\] Its exit code 2 means "linting was not successful due to a problem or failure", which collides with the agent-hook meaning of exit 2, so always wrap it.\[13\]
5. **Hook semantics differ in ways that matter.** In Claude Code, stderr from a hook that exits 0 "goes to the debug log only", so a lint hook must exit 2 for Claude to see the findings.\[14\] A `PostToolUse` exit 2 "does not undo anything; it simply surfaces stderr to the model".\[15\] Codex CLI mirrors Claude Code's event names and payloads.\[16\] Gemini CLI uses `AfterTool` with regex matchers and treats exit 2 as a "Critical Block" whose stderr becomes the reason.\[17\]
6. **Vale already ships agent integrations.** The vale-cli organization publishes `vale-cli/agent-tools`, a Claude Code plugin with skills and "an edit-time linting hook" that "hands back only the error-level alerts".\[18\]\[19\] Its MCP server is the one paid piece and runs on Vale CMS.\[19\] textlint has a built-in MCP server (`textlint --mcp`, since v15.2.0). A community server, ChrisChinchilla/Vale-MCP (MIT), integrates Vale "into AI coding assistants like Claude Desktop, Cursor, and other MCP-compatible tools", replacing the archived theletterf/vale-mcp-server.
7. **GitLab CI integration is simple if tools can emit Code Quality JSON.** rumdl (`--output-format gitlab`) and markdownlint-cli2 (codequality formatter) do this natively.\[12\]\[20\] Vale, html-validate, textlint and lychee need a small `jq` conversion. GitLab's built-in CodeClimate template "was deprecated in GitLab 17.3 and is planned for removal in 19.0", so integrate tools directly.\[21\]

## Comparison table

| Tool                                     | License                            | Markdown / HTML / Org                                     | Structural rules                                    | Prose rules                                         | Custom rule authoring                 | Autofix                                                            | Output formats                                                                                | Runtime and speed                       | Maturity (Sept 2026)               |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------- |
| Vale                                     | MIT                                | Native / native / native                                  | Limited (headings, scopes, front matter fields)     | Yes, the core purpose                               | YAML + regex, NLP tags, Tengo scripts | Rule actions (replace, remove, edit) applied by editors and agents | line, JSON, CLI, custom Go templates                                                          | Single Go binary, parallel, fast        | Very active; 3.21.0 on 2026-09-09  |
| rumdl                                    | MIT                                | Native (GFM, MkDocs, MDX, Quarto, MyST flavors) / no / no | 79 markdownlint-compatible rules                    | No                                                  | Config only, no plugin API            | Yes, `--fix` and `fmt`                                             | text, json, json-lines, sarif, junit, github, gitlab, azure, pylint                           | Single Rust binary, very fast, caching  | Very active, Beta; v0.2.75         |
| markdownlint-cli2                        | MIT                                | Native / no / no                                          | 60+ rules (MD001 to MD060, MD002 and MD006 removed) | No (MD044 proper names only)                        | JavaScript custom rules               | Yes, `--fix` for fixable rules                                     | stderr default; JSON, pretty, GitLab Code Quality, others via formatters                      | Node.js, fast                           | Mature, active                     |
| remark-lint (unified)                    | MIT                                | Native / via rehype / no                                  | Large rule set in presets                           | Via retext plugins (readability, passive, equality) | JavaScript unified plugins            | Yes, via `remark --output`                                         | Reporter-based (vfile), JSON reporter                                                         | Node.js, moderate                       | Mature, slower cadence             |
| textlint                                 | MIT                                | Plugin / plugin / plugin (stale)                          | Few                                                 | Yes, large rule ecosystem                           | JavaScript rules on AST               | Yes, `--fix`                                                       | checkstyle, compact, github, jslint-xml, json, junit, pretty-error, stylish, table, tap, unix | Node.js 20+, moderate                   | Active; 15.8.0                     |
| Prettier                                 | MIT                                | Formats / formats / no                                    | Formatting only                                     | No                                                  | No                                    | Yes (formatter)                                                    | `--check` exit code                                                                           | Node.js, fast                           | Mature                             |
| dprint                                   | MIT                                | Formats (plugin) / plugin / no                            | Formatting only                                     | No                                                  | Wasm plugins                          | Yes (formatter)                                                    | exit code, diff                                                                               | Rust binary, very fast                  | Active                             |
| mdformat                                 | MIT                                | Formats / no / no                                         | Formatting only                                     | No                                                  | Python plugins                        | Yes (formatter)                                                    | `--check` exit code                                                                           | Python, fast                            | Active                             |
| Harper                                   | Apache-2.0                         | Native / via LSP comments / via Emacs LSP                 | No                                                  | Grammar, spelling, phrasing (English only)          | Rust (in-tree rules), weir rules      | Suggestions via LSP                                                | harper-cli text; LSP diagnostics                                                              | Rust, milliseconds per document         | Very active; v2.11.0               |
| LanguageTool (+ ltex-ls)                 | LGPL-2.1 core; Premium proprietary | Via ltex-ls / via ltex-ls / via ltex-ls                   | No                                                  | Grammar, style, many languages                      | XML pattern rules                     | Suggestions                                                        | JSON API, LSP                                                                                 | Java, heavy (seconds, GBs with n-grams) | Active; Premium is commercial      |
| proselint                                | BSD-3-Clause                       | Plain text (use via Vale package)                         | No                                                  | Yes                                                 | Python                                | No                                                                 | text, JSON                                                                                    | Python                                  | Slow cadence                       |
| write-good                               | MIT                                | Plain text (use via Vale package)                         | No                                                  | Passive, weasel words, cliches                      | JavaScript                            | No                                                                 | text                                                                                          | Node.js                                 | Stale                              |
| alex                                     | MIT                                | Markdown native, others as text                           | No                                                  | Inclusive language                                  | Word lists via retext-equality        | No                                                                 | text, JSON reporter                                                                           | Node.js                                 | Slow cadence                       |
| cspell                                   | MIT                                | Yes / yes / yes (text)                                    | No                                                  | Spelling                                            | Dictionaries, regex ignores           | No                                                                 | text, JSON reporter                                                                           | Node.js, fast                           | Active                             |
| typos                                    | MIT or Apache-2.0                  | Any text                                                  | No                                                  | Common misspellings                                 | Config word lists                     | Yes, `--write-changes`                                             | brief, long, JSON                                                                             | Rust binary, very fast                  | Active                             |
| codespell                                | GPL-2.0                            | Any text                                                  | No                                                  | Common misspellings                                 | Dictionary files                      | Yes, `-w`                                                          | text                                                                                          | Python, fast                            | Active                             |
| lychee                                   | MIT or Apache-2.0                  | Yes / yes / yes (URL extraction)                          | Link validity                                       | No                                                  | No                                    | No                                                                 | compact, detailed, json, junit, markdown                                                      | Rust binary, async, fast                | Active; 0.24.2                     |
| markdown-link-check / linkinator         | ISC / MIT                          | Markdown / HTML and Markdown                              | Link validity                                       | No                                                  | No                                    | No                                                                 | text, JSON (linkinator)                                                                       | Node.js                                 | Maintenance mode / active          |
| html-validate                            | MIT                                | No / native / no                                          | Extensive HTML rules                                | Few (a11y)                                          | JavaScript plugins and rules          | Yes, growing in 11.x                                               | checkstyle, codeframe, json, stylish, text, any ESLint formatter                              | Node.js, fast, offline                  | Very active; 11.16.0 on 2026-09-15 |
| HTMLHint                                 | MIT                                | No / native / no                                          | Basic HTML rules                                    | No                                                  | JavaScript rules                      | No                                                                 | checkstyle, compact, html, json, junit, markdown, sarif, unix                                 | Node.js, fast                           | Active; 1.9.2                      |
| W3C Nu HTML Checker (vnu)                | MIT                                | No / native / no                                          | Spec conformance                                    | No                                                  | No                                    | No                                                                 | gnu, xml, json, text                                                                          | Java 17+, native binaries, Docker       | Rolling `latest` release           |
| org-lint (Emacs)                         | GPL-3.0                            | No / no / native                                          | Org syntax (links, blocks, drawers, keywords)       | No                                                  | Emacs Lisp checkers                   | No                                                                 | Lisp data (script it to text)                                                                 | Emacs batch, startup cost per call      | Ships with Org, stable             |
| Acrolinx, Writer, Grammarly (commercial) | Proprietary                        | Varies, mostly via integrations and APIs                  | No                                                  | Yes, style governance                               | Web admin UIs, term bases             | Suggestions                                                        | API JSON                                                                                      | SaaS                                    | Commercial                         |

## Details per tool

### Vale

Vale is a markup-aware prose linter written in Go and shipped as one binary with "no runtime to install and files linted in parallel".\[22\] Rules live in YAML style folders configured by `.vale.ini`, and packages such as Google, Microsoft, RedHat, write-good, proselint, alex and Readability are installed with `vale sync`. For AI-generated text specifically, the community package vale-ai-tells (MIT, v1.0.0 published 2026-08-25, "17 rules, benchmarked") flags common LLM prose tells and ships a SKILL.md for Claude Code.\[23\]

**Pros**

- Native Markdown, HTML and Org parsing, with scopes such as `heading`, `paragraph`, `sentence`, `list`, `table.cell`, `blockquote` and front matter fields.\[24\]\[25\] This means rules skip code blocks and URLs by default.
- Every prose rule type the user asked for fits into a built-in check: `existence` for banned words and em dashes, `substitution` for terminology, `capitalization` with `match: $sentence` for sentence-case headings, `metric` for readability formulas and paragraph length, `spelling` with Hunspell dictionaries and vocabularies, and `occurrence` for counts.
- Adopting an external style guide later only needs a `Packages =` line.
- Rules can carry fixes (actions `suggest`, `replace`, `remove`, `edit`), which "an agent applies without deciding anything".\[22\]
- Official agent tooling exists: the `vale-cli/agent-tools` Claude Code plugin gives skills plus an edit-time hook.\[19\]

**Cons**

- It is not a structural Markdown linter: it has no list indentation, table pipe alignment or code-fence language checks. Pair it with rumdl or markdownlint.
- Scoped `metric` rules need Vale 3.21.0 or later. Earlier versions silently measured the whole document, according to the downstream issue that tracked this.\[3\]
- An open issue (#1191, observed on v3.22.0) reports that `occurrence` alerts can be placed "on the first copy of the match anywhere in the file, outside the rule's scope". This matters when a hook relates alerts to lines the agent just edited.\[26\]
- By default Vale only exits non-zero for error-level alerts, so enforced rules must use `level: error`, or the wrapper must parse JSON.\[19\]

### rumdl

rumdl is a "fast Markdown linter and formatter written in Rust", modelled on Ruff. It auto-discovers markdownlint and markdownlint-cli2 config files. Its adopter list includes Firefox and Docker Docs.\[6\] It ships a pre-commit repo (`rvben/rumdl-pre-commit`, with a linting hook `rumdl` and a formatting hook `rumdl-fmt`) and a GitHub Action (`rvben/rumdl@v0`) with PR annotations.\[8\] Its VS Code extension claims "97.2% markdownlint compatibility and 5x performance improvement".\[5\] That is a vendor claim that has not been independently benchmarked here.

**Pros**

- It is a single binary with no Node dependency, which gives fast cold starts in per-edit hooks. It also caches results so it "only re-lints files that have changed".\[9\]
- It has the widest built-in output format list of any tool reviewed, including `gitlab` (Code Quality JSON) and `sarif`.\[20\] It also has `--stdin` with a filename option.
- `--fix` works together with batch output formats (fixed in v0.1.43), and inline disable comments are respected in fix mode.\[27\]
- Built-in Markdown flavors (GFM, MkDocs, MDX, Quarto, MyST) reduce false positives.\[6\]\[8\]

**Cons**

- It is still Beta, pre-1.0 and releases very frequently.\[9\]\[10\] Pin the version in hooks and CI.
- It has no custom rule plugin system, so rules like paragraph length need Vale or markdownlint-cli2.
- It is Markdown only.

### markdownlint-cli2 (and markdownlint-cli)

markdownlint-cli2 is David Anson's configuration-based CLI over the markdownlint library. Configuration can be `.markdownlint-cli2.jsonc`, `.yaml`, `.cjs` or `.mjs`. `customRules`, `markdownItPlugins` and `outputFormatters` can be loaded from packages or local scripts.\[28\] A Docker image (`davidanson/markdownlint-cli2`) is available for CI.\[12\]

**Pros**

- It has the most established Markdown rule set, with editor parity through vscode-markdownlint.
- Custom rules are plain JavaScript over micromark or markdown-it tokens, which makes a paragraph-length rule a 20-line file.
- `markdownlint-cli2-formatter-codequality` writes a GitLab Code Quality artifact directly. Community rule packs such as `@github/markdownlint-github` exist.\[12\]\[29\]

**Cons**

- It needs Node.js, and cold start is slower than rumdl for per-edit hooks.
- JSON output needs a config entry (an output formatter) rather than a one-off flag.\[30\]
- Its exit code 2 means a tool failure, so a wrapper must translate exit codes for agent hooks.

### remark-lint (unified ecosystem)

remark-lint is the unified ecosystem's Markdown linter. It is driven by `remark-cli` with presets (`remark-preset-lint-recommended`, `consistent`, `markdown-style-guide`). Prose checks come from retext plugins through `remark-retext`: `retext-readability`, `retext-passive`, `retext-equality` (the engine behind alex) and `retext-simplify`.

**Pros**

- It has a very flexible AST (mdast), and custom rules via `unified-lint-rule` are idiomatic.
- `remark --output` rewrites files, which works as a formatter-style autofix.
- One pipeline can mix structural and prose checks.

**Cons**

- The ESM-only package sprawl makes configuration fiddly.
- It is slower than rumdl and Vale.
- HTML needs rehype, and there is no Org support.
- For most teams, markdownlint or rumdl plus Vale is simpler.

### textlint

textlint is a pluggable natural-language linter (Node.js 20+ since v15). It has `--fix` and `--dry-run`, and formatters checkstyle, compact, github, jslint-xml, json, junit, pretty-error, stylish, table, tap and unix.\[31\]\[32\] Rules include `textlint-rule-sentence-length`, `textlint-rule-max-comma`, `textlint-rule-write-good`, `textlint-rule-alex`, `textlint-rule-terminology` and `textlint-rule-first-sentence-length`.\[33\]\[34\] Since v15.2.0 it can run as an MCP server (`npx textlint --mcp --config ...`).\[35\]

**Pros**

- It has the richest JavaScript prose-rule ecosystem after Vale, with real autofix for many rules.
- Its built-in MCP mode lets agents call it as a tool.

**Cons**

- Org support depends on `textlint-plugin-org`. The original package is at 0.3.5 and was flagged by Socket as having an unhealthy release cadence, while a fork (`@fenril058/textlint-plugin-org`) adds orga v4 support.\[36\]\[37\]
- HTML needs `textlint-plugin-html`.
- No official max-paragraph rule exists, although writing one is easy.
- It has no SARIF or Code Quality formatter.
- Much of the ecosystem is Japanese-focused.

### Formatters: Prettier, dprint, mdformat

These tools rewrite files; they do not report style violations. They are useful in `afterFileEdit` hooks, where the agent cannot receive feedback anyway. Prettier formats Markdown and HTML (`proseWrap` controls line wrapping), dprint does the same as a Rust binary with Wasm plugins, and mdformat is a CommonMark-strict Python formatter with plugins for GFM tables and front matter.

**Pros:** they are deterministic, they remove a whole class of structural nits, and there is nothing for the agent to fix.

**Cons:** they cannot enforce content rules. Their output can conflict with markdownlint or rumdl rules (for example emphasis style or line length), so align configs. Also, rewriting a file under the agent can confuse agents that cache file contents, so re-read after formatting.

### Harper

Harper is an offline, Rust-powered English grammar checker that Automattic acquired in November 2024, hiring its creator Elijah Potter; Automattic says it "delivers grammar and language suggestions in under 20 milliseconds". It is distributed as `harper-ls` (a language server), `harper.js` (Wasm), `harper-cli` and editor extensions. The project says it takes "milliseconds to lint a document" and uses "less than 1/50th of LanguageTool's memory footprint", which is a project claim.\[38\] The latest GitHub release seen is v2.11.0.\[39\]

**Pros:** it is fast enough for per-edit hooks, private, and catches grammar and spelling mistakes that regex-based Vale rules cannot.

**Cons:** it is English only, and `harper-cli` is described as "a debugging tool", so its CLI output format is not a stable CI contract.\[40\] Custom rules require Rust or Harper's rule language, not simple YAML. Use it as an optional grammar layer.

### LanguageTool, ltex-ls and commercial checkers

The LanguageTool core is open source (LGPL-2.1). LanguageTool Premium and its hosted API are commercial. `ltex-ls` (and the community fork ltex-ls-plus) wraps it as an LSP for Markdown, HTML, LaTeX and Org. Elijah Potter, Harper's creator, writes in the Harper README that LanguageTool is great "if you have gigabytes of RAM to spare and are willing to download the ~16GB n-gram dataset" and that "it would take several seconds to lint even a moderate-size document", which is too slow for per-edit hooks. Acrolinx and Writer.com are proprietary enterprise style-governance platforms with APIs and term bases. Grammarly has no supported CLI for CI use. These tools make sense only if an organization already licenses them, and then the pattern is to call their API from the Stop hook or CI, not from every edit.

### proselint, write-good and alex

proselint (Python), write-good (Node) and alex (Node, inclusive language via retext-equality) are standalone prose checkers, and all three are also available as Vale packages. Standalone, they understand plain text or Markdown only, their release cadence is slow, and their custom rules need code. Recommendation: consume them as Vale packages (`Packages = write-good, proselint, alex`) so one engine, one config and one output format cover all three formats.

### Spelling: cspell, typos, codespell

cspell (Node) is the most configurable, with project dictionaries, per-language settings and regex ignore patterns. typos (Rust, binary) and codespell (Python) look for known misspellings with a low false-positive rate and can write fixes (`typos --write-changes`, `codespell -w`). Vale's `spelling` check with a project vocabulary also covers spelling across all three formats, so a separate spell checker is optional. typos is the cheapest addition for per-edit hooks.

### Link checking: lychee, markdown-link-check, linkinator

lychee is a Rust async link checker for Markdown, HTML and plain text (which covers Org URLs through URL extraction). Its output formats are compact, detailed, json, junit and markdown, and v0.24.0 added JUnit output and line and column numbers.\[41\]\[42\] Network-bound link checks are too slow and flaky for per-edit hooks, so run lychee with `--offline` (local file links only) in hooks and a full check in CI. markdown-link-check is Markdown only and less capable, and linkinator (Node) crawls HTML sites. Internal anchors in Markdown are also checked by rumdl and markdownlint (MD051).

### HTML: html-validate, HTMLHint, Nu HTML Checker

html-validate is an offline, rule-based HTML validator. It was very active in September 2026 (11.16.0 on 2026-09-15), with autofix support expanding in 11.x.\[43\] Its formatters are checkstyle, codeframe, json, stylish and text, and "any ESLint compatible reporter will work".\[44\]\[45\] HTMLHint (1.9.2) is simpler but has native SARIF output.\[46\]\[47\] The W3C Nu HTML Checker (vnu) is the reference conformance checker. It no longer uses version numbers ("The release named 'latest' is 'production-ready'"), needs Java 17+ unless you use the native binaries or Docker image, and is slower to start.\[48\]\[49\] Recommendation: use html-validate in hooks and vnu in CI when spec conformance matters. Use Vale for the prose inside HTML.

### org-lint

org-lint ships with Org. It implements linting "for Org syntax", and new checkers are added with `org-lint-add-checker`.\[50\] It reports issues such as a missing language in a source block, incomplete blocks and misplaced planning lines, each with a trust level.\[51\] It is interactive by design, so batch use requires a small Emacs Lisp wrapper that prints reports and sets the exit code (see the Org section).

## Agent hook integration patterns

### One wrapper script for every agent

Put the logic in one script and adapt only the thin per-agent config. The script reads the hook JSON from stdin, finds the edited file path under whichever key the agent uses, runs the right linters, and exits 2 with findings on stderr.

```bash
#!/usr/bin/env bash
# .agents/hooks/lint-docs.sh
# Usage: called by agent hooks with JSON on stdin, or directly: lint-docs.sh FILE
set -uo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ $# -ge 1 ]; then
  file="$1"
else
  payload="$(cat)"
  file="$(jq -r '
    .tool_input.file_path // .tool_input.path // .tool_input.filePath //
    .file_path // .tool_info.file_path // .postToolUse.parameters.path // empty
  ' <<<"$payload")"
fi

if [ -z "${file:-}" ] || [ ! -f "$file" ]; then exit 0; fi

out=""
fail=0
case "$file" in
  *.md|*.markdown|*.mdx)
    out+="$(rumdl check --output-format concise "$file" 2>&1)" || fail=1
    out+=$'\n'"$(vale --output=line --minAlertLevel=error "$file" 2>&1)" || fail=1
    ;;
  *.html|*.htm)
    out+="$(npx --no-install html-validate --formatter text "$file" 2>&1)" || fail=1
    out+=$'\n'"$(vale --output=line --minAlertLevel=error "$file" 2>&1)" || fail=1
    ;;
  *.org)
    out+="$(emacs -Q --batch -l "$HOOK_DIR/org-lint-batch.el" "$file" 2>&1)" || fail=1
    out+=$'\n'"$(vale --output=line --minAlertLevel=error "$file" 2>&1)" || fail=1
    ;;
  *) exit 0 ;;
esac

if [ "$fail" -ne 0 ]; then
  printf 'Documentation lint failed for %s. Fix every issue below before continuing:\n%s\n' "$file" "$out" >&2
  exit 2
fi
exit 0
```

Design notes:

- Keep per-edit hooks fast and local. Use rumdl, Vale, html-validate and org-lint here, and leave network link checks and LanguageTool for the Stop hook or CI.
- Send only error-level findings. Vale's official hook does this for the same reason: to avoid flooding the agent's context.\[19\]
- Use a Stop-style hook as the real gate, because post-edit hooks cannot undo the edit.

### Claude Code

`PostToolUse` fires "after a tool call succeeds". Hooks go in `.claude/settings.json` (shared, committed), `.claude/settings.local.json`, `~/.claude/settings.json`, managed policy settings, plugins, or skill and subagent frontmatter, and hooks from all levels merge.\[14\] For a PostToolUse hook, "exit 2 does not undo anything; it simply surfaces stderr to the model", and stderr from an exit-0 hook "goes to the debug log only".\[14\]\[15\] `Stop` can block, meaning it prevents Claude from stopping.\[15\]

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.agents/hooks/lint-docs.sh",
            "timeout": 60
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.agents/hooks/lint-changed-docs.sh",
            "timeout": 180
          }
        ]
      }
    ]
  }
}
```

A minimal `lint-changed-docs.sh` for the Stop hook lints every changed doc file, and it checks `stop_hook_active` to avoid infinite loops:

```bash
#!/usr/bin/env bash
payload="$(cat)"
if [ "$(jq -r '.stop_hook_active // false' <<<"$payload")" = "true" ]; then exit 0; fi
fail=0; out=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  res="$("$(dirname "$0")/lint-docs.sh" "$f" 2>&1)" || { fail=1; out+="$res"$'\n'; }
done < <(git diff --name-only HEAD -- '*.md' '*.mdx' '*.html' '*.htm' '*.org'; git ls-files --others --exclude-standard -- '*.md' '*.html' '*.org')
[ "$fail" -eq 0 ] && exit 0
printf 'Do not finish yet. Documentation lint errors remain:\n%s' "$out" >&2
exit 2
```

Alternatives: the official Vale plugin (`/plugin marketplace add vale-cli/agent-tools`, then `/plugin install vale@agent-tools`) installs an equivalent Vale-only hook plus skills.\[19\] There is also a known Windows issue (#80039) in which PostToolUse exit-2 stderr did not reach the model, so test on Windows or use WSL.\[52\]

### OpenAI Codex CLI

Codex hooks use Claude Code's event names and stdin payload shape ("same JSON shape, hook_event_name, session_id, hookSpecificOutput / additionalContext").\[53\] Hooks load from `hooks.json` next to each active config layer (for example `.codex/hooks.json` or `~/.codex/hooks.json`) or from inline `[hooks]` tables in `config.toml`.\[54\]\[55\] File edits arrive as the `apply_patch` tool.\[56\] Codex skips any non-managed hook whose hash you have not reviewed, and it does so silently in `codex exec`, so trust the hook via `/hooks` before relying on it in automation.\[55\]

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "^apply_patch$",
        "hooks": [
          {
            "type": "command",
            "command": ".agents/hooks/lint-docs-codex.sh",
            "timeout": 60
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": ".agents/hooks/lint-changed-docs.sh" }
        ]
      }
    ]
  }
}
```

Because `apply_patch` embeds the file paths in the patch text, `lint-docs-codex.sh` should extract the `*** Add File:` and `*** Update File:` lines from `tool_input` and call `lint-docs.sh` on each one. The Codex docs say a blocking PostToolUse "can't undo the tool's side effects".\[57\] Sources disagree on whether the file needs a top-level `hooks` wrapper, and the hook surface changed materially during 2026 (earlier versions only fired for Bash), so validate against your installed version.\[16\]\[58\]\[59\]

### Gemini CLI

Hooks live in `.gemini/settings.json` (project) or `~/.gemini/settings.json`.\[60\] Tool events are `BeforeTool` and `AfterTool`, and their matchers are regular expressions such as `write_.*`.\[17\] Exit 2 is a "Critical Block" that uses stderr as the reason, and structured output uses `{"decision": "deny", "reason": ...}`.\[17\]\[61\] `AfterAgent` can deny the whole turn, which makes it the equivalent of a Stop gate.\[61\] Hook stdout must be JSON only.\[62\] `gemini hooks migrate` converts Claude Code hooks, including rewriting `$CLAUDE_PROJECT_DIR` to `$GEMINI_PROJECT_DIR`.\[63\]

```json
{
  "hooks": {
    "AfterTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          {
            "name": "lint-docs",
            "type": "command",
            "command": "$GEMINI_PROJECT_DIR/.agents/hooks/lint-docs.sh"
          }
        ]
      }
    ],
    "AfterAgent": [
      {
        "hooks": [
          {
            "name": "lint-changed-docs",
            "type": "command",
            "command": "$GEMINI_PROJECT_DIR/.agents/hooks/lint-changed-docs.sh"
          }
        ]
      }
    ]
  }
}
```

### Cursor

Cursor reads `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` with `"version": 1`. The events include `afterFileEdit`, `postToolUse`, `preToolUse` and `stop` (with `loop_limit`). The `afterFileEdit` payload includes `file_path` and `edits`. For blocking events, "Exit code 2 is equivalent to permission: deny".\[64\]\[65\] `afterFileEdit` is best used for autofix (rumdl `--fix`, Prettier), and the `stop` hook is where remaining violations go back to the agent. Check your Cursor version's docs for the exact stop-hook output field that queues a follow-up message.

```json
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [{ "command": ".cursor/hooks/fix-docs.sh" }],
    "stop": [
      { "command": ".cursor/hooks/lint-changed-docs.sh", "loop_limit": 3 }
    ]
  }
}
```

Also add a project rule (`.cursor/rules/docs.mdc`) telling the agent to run `.agents/hooks/lint-docs.sh FILE` after editing docs. Rules are advisory, while hooks are deterministic.

### GitHub Copilot (cloud agent, CLI and VS Code)

Copilot hooks are JSON files in `.github/hooks/*.json` with `"version": 1`. The events are `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `agentStop`, `subagentStop` and `errorOccurred`.\[66\] For the cloud agent, "the hooks configuration file must be present on your repository's default branch".\[67\] GitHub documents `postToolUse` mainly for logging and auditing.\[66\] `preToolUse` denials fail closed: "exit 2 always denies", but "timeouts always fail-open".\[68\] The practical pattern is to autofix in `postToolUse`, gate on `agentStop` where your version supports feedback, and always back it with CI, because the cloud agent's pull request runs your pipeline anyway. VS Code's agent hooks (preview) also read `.claude/settings.json` and use PascalCase event names, so one Claude-style config can serve both.\[69\]

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [
      {
        "type": "command",
        "bash": ".agents/hooks/fix-docs.sh",
        "timeoutSec": 60
      }
    ]
  }
}
```

### Other agents and MCP options

- **Vale official agent-tools:** skills (`/vale:setup`, `/vale:fix`, `/vale:triage`, `/vale:vocab`, `/vale:ci`), a free edit-time hook, and a paid Vale CMS MCP server. Agents without plugin support can read `https://vale.sh/AGENTS.md`. \[19\]
- **Community Vale-MCP:** `npx vale-mcp@latest` exposes "lint a file" and "lint AI-generated text before it's written" tools to any MCP client.\[70\]
- **textlint MCP:** `npx textlint --mcp` exposes textlint rules as MCP tools.\[35\]
- **MCP versus hooks:** MCP tools are advisory, because the model decides whether to call them. Hooks are deterministic. Use MCP for interactive rule authoring and triage, and hooks for enforcement.

## CI and pre-commit integration

### pre-commit framework

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/rvben/rumdl-pre-commit
    rev: v0.2.75
    hooks:
      - id: rumdl
  - repo: local
    hooks:
      - id: vale
        name: vale
        entry: vale --minAlertLevel=error
        language: system
        types_or: [markdown, html, text]
        files: '\.(md|mdx|html?|org)$'
      - id: org-lint
        name: org-lint
        entry: emacs -Q --batch -l .agents/hooks/org-lint-batch.el
        language: system
        files: '\.org$'
      - id: html-validate
        name: html-validate
        entry: npx --no-install html-validate
        language: system
        files: '\.html?$'
```

### lefthook and husky

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    rumdl:
      glob: "*.{md,mdx}"
      run: rumdl check {staged_files}
    vale:
      glob: "*.{md,mdx,html,htm,org}"
      run: vale --minAlertLevel=error {staged_files}
    org-lint:
      glob: "*.org"
      run: emacs -Q --batch -l .agents/hooks/org-lint-batch.el {staged_files}
```

For husky, put `npx lint-staged` in `.husky/pre-commit` and map the same globs to the same commands in `lint-staged` config. Pre-commit hooks also catch agent commits, because the agent runs `git commit` through the shell.

### GitLab CI with Code Quality reports

GitLab's Code Quality artifact is a JSON array of objects with `description`, `check_name`, `fingerprint`, `severity` (one of info, minor, major, critical or blocker) and `location.path` plus `location.lines.begin`. GitLab combines reports from multiple jobs. The parser rejects a byte order mark.\[71\]\[72\]\[73\]

```yaml
# .gitlab-ci.yml
stages: [lint]

markdown-structure:
  stage: lint
  image: python:3.12-slim
  script:
    - pip install rumdl==0.2.75
    - rumdl check --output-format gitlab . > gl-cq-rumdl.json || true
    - rumdl check .
  artifacts:
    when: always
    reports:
      codequality: gl-cq-rumdl.json

prose:
  stage: lint
  image: jdkato/vale:latest
  before_script:
    - apk add --no-cache jq || true
    - vale sync
  script:
    - |
      vale --output=JSON --no-exit docs/ | jq '[to_entries[] | .key as $f | .value[] | {
        description: .Message,
        check_name: .Check,
        fingerprint: (($f + ":" + (.Line|tostring) + ":" + .Check + ":" + .Message) | @base64),
        severity: (if .Severity == "error" then "major" elif .Severity == "warning" then "minor" else "info" end),
        location: {path: $f, lines: {begin: .Line}}
      }]' > gl-cq-vale.json
    - vale --minAlertLevel=error docs/
  artifacts:
    when: always
    reports:
      codequality: gl-cq-vale.json

html:
  stage: lint
  image: node:22-alpine
  script:
    - npx html-validate --formatter json "public/**/*.html" > html-validate.json || true
    - npx html-validate "public/**/*.html"
  artifacts:
    when: always
    paths: [html-validate.json]

links:
  stage: lint
  image: lycheeverse/lychee:latest
  script:
    - lychee --format junit --output lychee.xml --no-progress "docs/**/*.md" "docs/**/*.org" "public/**/*.html"
  artifacts:
    when: always
    reports:
      junit: lychee.xml
  allow_failure: true
```

Notes:

- markdownlint-cli2 users can replace the rumdl job with the `markdownlint-cli2-formatter-codequality` formatter configured in `.markdownlint-cli2.jsonc`, which writes `markdownlint-cli2-codequality.json`.\[12\]
- To get the same findings into the Security tab, SARIF can be uploaded via `artifacts:reports:sarif`, but "GitLab ingests security findings only when the job that produces them completes successfully".\[74\] Doc lint belongs in Code Quality, not the vulnerability report.
- Do not build on the old `Code-Quality.gitlab-ci.yml` CodeClimate template, which is deprecated and scheduled for removal in GitLab 19.0.\[21\]
- If the Vale image or flags differ in your version (for example `--no-exit`), keep the pattern: produce JSON without failing, convert it, then run a second, gating invocation.

### GitHub Actions

- The rumdl action (`rvben/rumdl@v0`) supports an annotations report type that "displays issues directly in the PR's Files changed tab".\[8\]
- Vale has an official GitHub Action that posts annotations or reviewdog comments.\[18\]
- markdownlint-cli2 has `DavidAnson/markdownlint-cli2-action`.
- HTMLHint's SARIF output or rumdl's `sarif` output can be uploaded to GitHub code scanning.\[8\]\[46\]
- lychee's docs recommend JUnit output with a JUnit report action for PR annotations.\[75\]

## Implementing a maximum paragraph length rule

### Vale (recommended, works on Markdown, HTML and Org)

With Vale 3.21.0 or later, use a scoped `metric` rule, where `formula` can use built-in variables such as `words` and `sentences`:

```yaml
# .vale/styles/House/ParagraphWords.yml
extends: metric
message: "This paragraph has %s words. Keep paragraphs to 120 words or fewer."
level: error
scope: paragraph
formula: words
condition: "> 120"
```

```yaml
# .vale/styles/House/ParagraphSentences.yml
extends: metric
message: "This paragraph has %s sentences. Keep paragraphs to 5 sentences or fewer."
level: error
scope: paragraph
formula: sentences
condition: "> 5"
```

For Vale versions before 3.21, the proven fallback is an `occurrence` rule that counts word tokens per paragraph:

```yaml
extends: occurrence
message: "Paragraphs should be 120 words or fewer."
level: error
scope: paragraph
max: 120
token: '\b\w+\b'
```

Related house rules that cover the user's other examples, in the same style folder:

```yaml
# House/EmDash.yml
extends: existence
message: "Do not use em dashes. Rewrite with a comma, colon or parentheses."
level: error
nonword: true
tokens:
  - "—"
```

```yaml
# House/HeadingCase.yml
extends: capitalization
message: "Use sentence case for headings: '%s'."
level: error
scope: heading
match: $sentence
```

```ini
# .vale.ini
StylesPath = .vale/styles
MinAlertLevel = suggestion
Packages = Google, write-good, proselint, alex
Vocab = House

[*.{md,mdx,html,org}]
BasedOnStyles = Vale, House
```

Caveats: Vale's `paragraph` scope excludes list items, table cells, headings and blockquotes, so long list items need a separate rule scoped to `list`.\[25\] Vale counts words and sentences, not source lines. If you need a line cap, use the markdownlint rule below.

### markdownlint-cli2 (JavaScript custom rule)

```js
// .markdownlint-rules/max-paragraph-words.mjs
export default {
  names: ["DOC001", "max-paragraph-words"],
  description: "Paragraph exceeds the maximum length",
  tags: ["paragraph", "length"],
  parser: "micromark",
  function: (params, onError) => {
    const maxWords = Number(params.config.max_words ?? 120);
    const maxLines = Number(params.config.max_lines ?? 8);
    const stack = [...params.parsers.micromark.tokens];
    while (stack.length) {
      const token = stack.shift();
      if (token.children) stack.push(...token.children);
      if (token.type !== "paragraph") continue;
      const lines = params.lines.slice(token.startLine - 1, token.endLine);
      const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
      if (words > maxWords || lines.length > maxLines) {
        onError({
          lineNumber: token.startLine,
          detail: `${words} words over ${lines.length} lines (max ${maxWords} words, ${maxLines} lines)`,
        });
      }
    }
  },
};
```

```jsonc
// .markdownlint-cli2.jsonc
{
  "customRules": ["./.markdownlint-rules/max-paragraph-words.mjs"],
  "config": { "max-paragraph-words": { "max_words": 120, "max_lines": 8 } },
  "outputFormatters": [["markdownlint-cli2-formatter-codequality"]],
}
```

### remark-lint and textlint (JavaScript rules)

In remark-lint, the same rule is a `unified-lint-rule` plugin that visits `paragraph` nodes, counts words with `mdast-util-to-string`, and calls `file.message()`. In textlint, it is a rule that handles `Syntax.Paragraph`, and it works on any format that has a parser plugin, including Org via the Org plugin:

```js
// textlint-rule-max-paragraph-words.js
module.exports = function (context, options = {}) {
  const { Syntax, RuleError, report, getSource } = context;
  const max = options.max ?? 120;
  return {
    [Syntax.Paragraph](node) {
      const words = getSource(node).split(/\s+/).filter(Boolean).length;
      if (words > max)
        report(
          node,
          new RuleError(`Paragraph has ${words} words (max ${max})`),
        );
    },
  };
};
```

rumdl has no custom rule API, and formatters and grammar checkers do not model paragraph length. For Org, see the custom `org-lint` checker in the next section. Vale's rules above already apply to `.org` files, which is the simpler option.

## Org mode support gaps and workarounds

**What works natively:**

- Vale parses `.org` natively, skips code blocks, literal examples and verbatim strings, supports comment-based configuration, and lints Org front matter keywords.\[1\]\[24\] Every prose rule and the paragraph-length metric work unchanged.
- org-lint checks Org syntax and can be extended.
- lychee extracts URLs from Org files as text.
- cspell, typos and codespell treat Org as text.

**What is missing:**

- There is no Org equivalent of markdownlint or rumdl, so heading-structure rules (single top-level heading, no skipped levels), list style consistency, table formatting and "every source block has a language" checks come either from org-lint's built-in checkers or from custom code.
- textlint's Org plugin exists in two forks with low activity.
- Harper and LanguageTool reach Org through LSP editor integrations rather than stable CLIs.
- No tree-sitter-org based linter with a rule system surfaced in this research. The tree-sitter-org grammar can back a custom script, but you would be writing a linter from scratch.

**Workaround 1: org-lint in batch mode with a custom checker (recommended).**

```elisp
;; .agents/hooks/org-lint-batch.el
;; Usage: emacs -Q --batch -l org-lint-batch.el FILE...
(require 'org)
(require 'org-lint)

;; Custom checker: paragraph length (Org 9.6+ checker API)
(org-lint-add-checker 'long-paragraph
  "Report paragraphs longer than 120 words"
  (lambda (ast)
    (org-element-map ast 'paragraph
      (lambda (p)
        (let* ((beg (org-element-property :contents-begin p))
               (end (org-element-property :contents-end p))
               (n (and beg end (count-words beg end))))
          (when (and n (> n 120))
            (list beg (format "Paragraph has %d words (max 120)" n)))))))
  :trust 'high)

(let ((status 0))
  (dolist (file command-line-args-left)
    (with-current-buffer (find-file-noselect file)
      (org-mode)
      (dolist (report (org-lint))
        (let ((v (cadr report)))
          (setq status 1)
          (princ (format "%s:%s: [%s] %s\n" file (aref v 0) (aref v 1) (aref v 2)))))))
  (setq command-line-args-left nil)
  (kill-emacs status))
```

Each org-lint report is a vector of line, trust level and message, as the Org mailing list shows (for example `["118" "high" "Incorrect location for PROPERTIES drawer" ...]`).\[76\] Use `-Q` to skip user init for speed and reproducibility. If the repository needs a newer Org than the one bundled with Emacs, add `-f package-initialize` or put the Org checkout on the load path.\[51\] The same `org-lint-add-checker` pattern can enforce heading rules, required keywords (`#+TITLE`), source-block languages and more.

**Workaround 2: Vale plus a Python orgparse script.** For teams without Emacs in CI, a small Python script using the orgparse library can check heading depth and ordering, and Vale handles the prose.

**Workaround 3: pandoc conversion (last resort).** `pandoc -f org -t gfm file.org | rumdl check --stdin` reuses Markdown structural rules. However, line numbers no longer match the source, Org-specific constructs such as drawers and properties are dropped, and agents get findings they cannot map back to the file. Use it only in CI as an informational report.

## Recommendations

1. **Adopt this stack now:** Vale for all prose and paragraph rules on `.md`, `.html` and `.org`; rumdl for Markdown structure (or markdownlint-cli2 if you need JavaScript custom structural rules or already use vscode-markdownlint); html-validate for HTML; org-lint batch plus the custom checker for Org; typos for cheap spelling; and lychee in CI only. Pin versions: Vale 3.21.0 or later for scoped metrics, and a fixed rumdl release while it is Beta.
2. **Start with a minimal house style and grow it.** Begin with paragraph length, sentence length, heading sentence case, em dash ban and a small terminology substitution list, all at `level: error` so they gate. Put Google or Microsoft plus write-good and alex at `suggestion` level so they show in CI reports but do not block agents. When the real style guide arrives, move its rules into the `House` style or switch `BasedOnStyles`. If it resembles GitLab's documentation style, GitLab's own Vale rules in the gitlab-org/gitlab repository are a practical starting point to vendor.
3. **Use one wrapper script and thin per-agent adapters.** Use exit 2 and stderr for Claude Code, Codex and Gemini. For Cursor and Copilot, autofix in post-edit hooks and gate at stop time.
4. **Make CI the source of truth.** Gate merge requests with the same commands, and publish rumdl and Vale findings as GitLab Code Quality artifacts so reviewers see the same violations the agents saw.
5. **Keep hooks fast.** Lint only the edited file in per-edit hooks, send only error-level findings, and move network and heavyweight checks (lychee online, vnu, LanguageTool) to Stop hooks or CI.

## Caveats

- **Vale 3.21.0 behavior:** the scoped-metric capability and its 2026-09-09 release date are confirmed by Vale's own v3.21.0 release notes ("A `metric` rule with a scope now measures each block the scope names") and by the izkreny/agentifico tracker. Vale's metric documentation page still says metric rules are summary-scoped.\[77\] Verify with `vale --version` and a test rule before relying on it.
- **Vendor claims:** performance figures (rumdl "5x faster than markdownlint", Harper "less than 1/50th of LanguageTool's memory footprint") were not independently benchmarked.
- **Unsettled agent hook APIs:** the details changed repeatedly during 2026. Sources conflict on Codex's `hooks.json` shape and on which tools fire hooks. Copilot's documentation frames `postToolUse` as logging. Cursor's stop-hook follow-up field was not verified. Test each adapter on your installed version.
- **Not re-verified this cycle:** the licenses and status for LanguageTool, cspell, codespell, proselint, write-good, alex, remark-lint, mdformat, dprint, Prettier, markdown-link-check, linkinator, vnu output formats and the commercial tools come from general knowledge. The licenses of html-validate, lychee and textlint are likewise unconfirmed.
- **Commercial offerings:** Acrolinx, Writer.com, Grammarly and LanguageTool Premium change their API terms and CLI availability often, so confirm current terms before planning around them.

## Sources

1. [Org - Vale CLI](https://vale.sh/docs/formats/org)
2. [Vale: Your style, our editor](https://vale.sh/)
3. [feat(skills-maker): scope the length rules with metric by izkreny · Pull Request #175 · izkreny/agentifico](https://github.com/izkreny/agentifico/pull/175)
4. [lint prose with Vale · Issue #115 · izkreny/agentifico](https://github.com/izkreny/agentifico/issues/115)
5. [rumdl - Markdown Linter – Open VSX Registry](https://open-vsx.org/extension/rvben/rumdl)
6. [GitHub - sthagen/rvben-rumdl: Markdown Linter and Formatter written in Rust · GitHub](https://github.com/sthagen/rvben-rumdl)
7. [rumdl man | Linux Command Library](https://linuxcommandlibrary.com/man/rumdl)
8. [GitHub - guillp/rumdl: Fast Markdown linter and formatter written in Rust · GitHub](https://github.com/guillp/rumdl)
9. [GitHub - rvben/rumdl: Fast Markdown linter and formatter written in Rust · GitHub](https://github.com/rvben/rumdl)
10. [rumdl - Markdown Linting Tool for the AI Agent Era | X-CMD | rumdl](https://www.x-cmd.com/install/rumdl/)
11. [markdownlint-cli2/doc/OutputFormatters.md at main · DavidAnson/markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2/blob/main/doc/OutputFormatters.md)
12. [markdownlint-cli2/formatter-codequality/README.md at main · DavidAnson/markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2/blob/main/formatter-codequality/README.md)
13. [markdownlint-cli2 - npm](https://www.npmjs.com/package/markdownlint-cli2)
14. [Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
15. [Claude Code Hooks Complete Guide - Deterministic Enforcement Across the Tool Lifecycle | hidekazu-konishi.com](https://hidekazu-konishi.com/entry/claude_code_hooks_complete_guide.html)
16. [OpenAI Codex Hooks: Setup, Config, and Examples — HookStack](https://www.hookstack.app/guides/openai-codex-hooks)
17. [gemini-cli/docs/hooks/index.md at main · google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md)
18. [Vale · GitHub](https://github.com/vale-cli)
19. [Agent skills](https://vale.sh/skills)
20. [Global Settings Reference - rumdl](https://rumdl.dev/global-settings/)
21. [Code Quality](https://docs.gitlab.com/ci/testing/code_quality)
22. [GitHub - vale-cli/vale: :pencil: A markup-aware linter for prose built with speed and extensibility in mind. · GitHub](https://github.com/vale-cli/vale)
23. [vale-ai-tells - Vale AI Prose Linting Rules | EveryDev.ai](https://www.everydev.ai/tools/vale-ai-tells)
24. [Vale: Your style, our editor](https://vale.sh/docs/formats/front-matter)
25. [Scopes | Vale](https://vale.sh/docs/scopes)
26. [\`occurrence\` alert is placed on the first copy of the match anywhere in the file, outside the rule's scope · Issue #1191 · vale-cli/vale](https://github.com/vale-cli/vale/issues/1191)
27. [rvben/rumdl v0.1.43 on GitHub](https://newreleases.io/project/github/rvben/rumdl/release/v0.1.43)
28. [GitHub - DavidAnson/markdownlint-cli2: A fast, flexible, configuration-based command-line interface for linting Markdown/CommonMark files with the markdownlint library · GitHub](https://github.com/DavidAnson/markdownlint-cli2)
29. [@github/markdownlint-github - npm](https://www.npmjs.com/package/@github/markdownlint-github)
30. [markdownlint-cli2 — CLIs.dev](https://clis.dev/cli/markdownlint-cli2)
31. [Command Line Interface | textlint](https://textlint.org/docs/cli/)
32. [textlint v15.0.0 | textlint](https://textlint.org/blog/2025/06/22/textlint-15/)
33. [GitHub - textlint-rule/textlint-rule-sentence-length: textlint rule that limit maximum length of sentence.](https://github.com/textlint-rule/textlint-rule-sentence-length)
34. [GitHub - textlint-rule/textlint-rule-first-sentence-length: textlint rule that limit maximum length of First sentence of the section.](https://github.com/textlint-rule/textlint-rule-first-sentence-length)
35. [Releases · textlint/textlint](https://github.com/textlint/textlint/releases)
36. [textlint-plugin-org - npm Package Security Analysis - Socket](https://socket.dev/npm/package/textlint-plugin-org)
37. [GitHub - fenril058/textlint-plugin-org: Maintained fork of textlint-plugin-org with orga v4 support. · GitHub](https://github.com/fenril058/textlint-plugin-org)
38. [GitHub - ccoveille-forks/harper-Automattic: The Grammar Checker for Developers · GitHub](https://github.com/ccoveille-forks/harper-Automattic)
39. [Release v2.11.0 · Automattic/harper](https://github.com/Automattic/harper/releases/tag/v2.11.0)
40. [Grammar checking from the CLI with Harper | Don't panic, impl Things](https://gribnau.dev/posts/harper-cli/)
41. [GitHub - lycheeverse/lychee: ⚡ Fast, async, stream-based link checker written in Rust. Finds broken URLs and mail addresses inside Markdown, HTML, reStructuredText, websites and more!](https://github.com/lycheeverse/lychee)
42. [lycheeverse/lychee lychee-v0.24.0 on GitHub](https://newreleases.io/project/github/lycheeverse/lychee/release/lychee-v0.24.0)
43. [HTML-validate - Changelog](https://html-validate.org/changelog/)
44. [HTML-validate - Using API](https://html-validate.org/dev/using-api.html)
45. [HTML-validate - Using CLI](https://html-validate.org/usage/cli.html)
46. [Options | HTMLHint](https://htmlhint.com/usage/options/)
47. [htmlhint - npm](https://www.npmjs.com/package/htmlhint)
48. [The Nu Html Checker (vnu) | validator](http://validator.github.io/validator/)
49. [Release latest · validator/validator](https://github.com/validator/validator/releases/tag/latest)
50. [org/lisp/org-lint.el at master · emacsmirror/org](https://github.com/emacsmirror/org/blob/master/lisp/org-lint.el)
51. [How to call org-lint against org-mode file from command-line](https://kiwix.gnuisnotunix.com/emacs.stackexchange.com_en_all_2021-04/A/question/42196.html)
52. [Windows: PreToolUse hook exit 2 doesn't block the tool call, PostToolUse exit-2 stderr doesn't reach the model · Issue #80039 · anthropics/claude-code](https://github.com/anthropics/claude-code/issues/80039)
53. [Hooks: PostToolUse payload carries no failure signal, and PostToolUseFailure never fires · Issue #34289 · openai/codex](https://github.com/openai/codex/issues/34289)
54. [Hooks – Codex | OpenAI Developers](https://doc.jarvisuni.com/openai/codex/hooks.html)
55. [Codex Hooks Make the Harness Real](https://blakecrosley.com/blog/codex-hooks-make-the-harness-real)
56. [Interrupted synchronous \`PostToolUse\` emits \`hook/started\` without \`hook/completed\` · Issue #46765 · openai/codex](https://github.com/openai/codex/issues/46765)
57. [Hooks | ChatGPT Learn](https://developers.openai.com/codex/hooks)
58. [Codex Hooks Reference: PreToolUse, PostToolUse, Examples](https://agenticcontrolplane.com/blog/codex-cli-hooks-reference)
59. [Codex CLI - Symposium](https://symposium.dev/design/agent-details/codex-cli.html)
60. [Gemini CLI hooks | Gemini CLI](https://geminicli.com/docs/hooks/)
61. [Gemini CLI Hooks: From Manual Checks to AfterTool & AfterAgent Autonomy](https://thiele.dev/blog/gemini-cli-hooks-automating-the-ai-alignment-loop/)
62. [Hooks reference | Gemini CLI](https://geminicli.com/docs/hooks/reference/)
63. [feat(hooks): Hooks Commands Panel, Enable/Disable, and Migrate by Edilmo · Pull Request #14225 · google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli/pull/14225)
64. [Hooks | Cursor Docs](https://cursor.com/docs/hooks)
65. [Cursor hooks.json: JSON Schema, Events & Payloads — Nicolás Torres](https://ntorres.dev/blog/cursor-hooks-json-guide)
66. [About hooks for GitHub Copilot - GitHub Docs](https://docs.github.com/en/copilot/concepts/agents/hooks)
67. [Customize agent workflows with hooks - GitHub Docs](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks)
68. [GitHub Copilot hooks reference - GitHub Docs](https://docs.github.com/en/copilot/reference/hooks-reference)
69. [Copilot Hooks Preview: Master lifecycle control over your AI agent](https://aridanemartin.dev/blog/vscode-copilot-hooks/)
70. [GitHub - ChrisChinchilla/Vale-MCP · GitHub](https://github.com/ChrisChinchilla/Vale-MCP)
71. [gitlab/doc/ci/testing/code\_quality.md at master · diffblue/gitlab](https://github.com/diffblue/gitlab/blob/master/doc/ci/testing/code_quality.md)
72. [doc/ci/testing/code\_quality.md · 78e9299eef228fbe011f8d4209eb10ff64133ed7 · GitLab.org / GitLab · GitLab](https://gitlab.com/gitlab-org/gitlab/-/blob/78e9299eef228fbe011f8d4209eb10ff64133ed7/doc/ci/testing/code_quality.md)
73. [Code quality · Testing · Ci · Help · GitLab](https://repository.prace-ri.eu/git/help/ci/testing/code_quality.md)
74. [SARIF reports | GitLab Docs](https://docs.gitlab.com/user/application_security/detect/sarif/)
75. [GitHub CI recipes | Docs](https://lychee.cli.rs/continuous-integration/github/)
76. [\[O\] how to use org-lint](https://lists.gnu.org/archive/html/emacs-orgmode/2015-10/msg00357.html)
77. [metric - Vale CLI](https://vale.sh/docs/checks/metric)
