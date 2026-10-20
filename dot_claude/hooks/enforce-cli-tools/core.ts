/**
 * The enforce-cli-tools matcher: finds a banned CLI tool in command position
 * and builds the block message. Pure: the adapters read the rules file, the
 * allowlist file and the environment, and pass the text in.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp),
 * command.ts (Codex command hook).
 */

export interface Rule {
  tool: string;
  replacement: string;
}

/**
 * The text of `rules` -> its rules. One "<banned> <replacement>" pair per
 * line, blank and # lines skipped. The replacement takes the rest of the
 * line, so "pnpm dlx" survives whole.
 */
export function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(\S+)\s+(.*\S)\s*$/.exec(line);
    if (match?.[1] && match[2] && !match[1].startsWith("#"))
      rules.push({ tool: match[1], replacement: match[2] });
  }
  return rules;
}

/**
 * The tools this repo or session may still use: the first word of each line
 * of `.agent-allow-cli-tools`, and the AGENT_ALLOW_CLI_TOOLS value split on
 * whitespace or colons.
 */
export function allowList(file: string, env = ""): Set<string> {
  const fromFile = file
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter((tool) => tool && !tool.startsWith("#"));
  const fromEnv = env.split(/[\s:]+/).filter(Boolean);
  return new Set([...fromFile, ...fromEnv]);
}

/**
 * The command line without the body of any heredoc whose delimiter is quoted
 * (<<'EOF', <<"EOF", <<\EOF). The shell runs nothing in such a body, so a
 * banned name there is text. shortcut: one heredoc per line; a second one on
 * the same line keeps its body, which can only over-block.
 */
export function stripQuotedHeredocs(line: string): string {
  const opener = /<<(-?)\s*['"\\]+([A-Za-z_][A-Za-z0-9_]*)/;
  const kept: string[] = [];
  let delimiter = "";
  let dash = false;
  for (const row of line.split("\n")) {
    if (delimiter) {
      // <<- also strips leading tabs from the closing line.
      if ((dash ? row.replace(/^\t+/, "") : row) === delimiter) delimiter = "";
      continue;
    }
    kept.push(row);
    const match = opener.exec(row);
    if (match?.[2]) {
      dash = match[1] === "-";
      delimiter = match[2];
    }
  }
  return kept.join("\n");
}

const WRAPPERS = new Set([
  "sudo",
  "env",
  "command",
  "builtin",
  "exec",
  "nohup",
  "time",
  "timeout",
  "nice",
  "stdbuf",
  "xargs",
]);

/**
 * The command each segment of the line runs, in order. Only these positions
 * are checked, so `rg npm` and `git commit -m "drop npm"` stay clean.
 */
export function commandsRun(line: string): string[] {
  // Drop quoted-delimiter heredoc bodies before the quote pass: an apostrophe
  // in the text would otherwise pair with a quote lines away. Then blank
  // quoted spans, so a separator inside a string does not split. shortcut: an
  // unquoted heredoc body is still split naively; it can run $(...), so
  // dropping it would let a real call through.
  const text = stripQuotedHeredocs(line).replace(/'[^']*'|"[^"]*"/g, "q");
  const commands: string[] = [];
  // Brackets split too: whatever runs inside $(...), backticks or { ...; } is
  // its own command wherever it sits.
  for (const segment of text.split(/[&|;(){}`\n]/)) {
    let wrapped = false;
    for (const word of segment.split(/[ \t]+/).filter(Boolean)) {
      // Step over what precedes the real command: `sudo npm`, `CI=1 npm`.
      if (word.includes("=") || WRAPPERS.has(word)) {
        wrapped = true;
        continue;
      }
      // Then the wrapper's own flags and values (`timeout 30 npm`). The first
      // word of a real command is never a flag or a bare number.
      if (wrapped && /^[-0-9]/.test(word)) continue;
      const name = word.slice(word.lastIndexOf("/") + 1); // /usr/bin/npm -> npm
      if (!name) continue; // a bare trailing slash is not a command
      commands.push(name);
      break;
    }
  }
  return commands;
}

/** The first banned, not allowlisted tool the line runs, or undefined. */
export function violation(
  line: string,
  rules: Rule[],
  allowed: Set<string>,
): Rule | undefined {
  for (const command of commandsRun(line))
    for (const rule of rules)
      if (command === rule.tool && !allowed.has(command)) return rule;
  return undefined;
}

/**
 * The line with the first whole-word `tool` swapped for `replacement`, so the
 * model can retry in one turn. Empty for a multi-line command: the model
 * already has it, and a script-long hint only costs context.
 */
export function suggest(line: string, tool: string, replacement: string) {
  if (line.includes("\n")) return "";
  const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const edge = "[^A-Za-z0-9_.-]";
  const word = new RegExp(`(^|${edge})${escaped}(${edge}|$)`);
  if (!word.test(line)) return "";
  return line.replace(word, (_, before, after) => before + replacement + after);
}

/**
 * The command that adds the allow files to the exclude file of the repo, which
 * all worktrees share. Not .gitignore: the list is for the user of this hook.
 */
const excludeCommand = (root: string) =>
  `echo '.agent-allow-*' >> "$(git -C "${root}" rev-parse --path-format=absolute --git-path info/exclude)"`;

/** The reason the model reads when the call is blocked. */
export function blockMessage(line: string, rule: Rule, root: string): string {
  const suggested = suggest(line, rule.tool, rule.replacement);
  return [
    `Blocked: \`${rule.tool}\` is not allowed here, use \`${rule.replacement}\` instead.`,
    ...(suggested ? [`  suggested: ${suggested}`] : []),
    "",
    "Allow it anyway with one of:",
    `  * add "${rule.tool}" to ${root}/.agent-allow-cli-tools (persistent, per-repo),`,
    `    and keep it out of git: ${excludeCommand(root)}`,
    `  * set AGENT_ALLOW_CLI_TOOLS=${rule.tool} (one-off, colon-separated)`,
  ].join("\n");
}
