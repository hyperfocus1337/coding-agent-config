/**
 * Claude Rules Extension
 *
 * Loads `~/.claude/rules/**\/*.md` the way Claude Code loads user-level rules:
 *
 * - A rule with no `paths:` frontmatter is appended to the system prompt at
 *   `before_agent_start`. The block is built once at load, so it is byte-identical
 *   across turns and does not cost a prompt-cache miss.
 * - A rule with `paths:` is sent once per session, as a custom message, after the
 *   `read`, `write` or `edit` tool touches a file inside the project that matches
 *   one of its globs. `deliverAs: "steer"` places it before the next LLM call, which
 *   is when Claude delivers it. The message is persisted, so a resumed session does
 *   not send it twice.
 *
 * Globs are matched with `path.matchesGlob`, whose semantics are the ones Claude
 * documents: `*` stays inside a path segment, `**` crosses directories, braces expand,
 * and a pattern with no slash matches the project root only. A path is relative to
 * `ctx.cwd`; a file outside it matches nothing.
 *
 * Not carried over, and why: project-scope `.claude/rules/`, because this
 * repository holds user scope only; `@import` expansion and `claudeMdExcludes`,
 * because no rule here uses them.
 *
 * Reference: https://code.claude.com/docs/en/memory, and pi-code's
 * `extensions/claude-rules.ts` for the contract this reproduces a subset of.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseFile } from "../claude-commands/index.ts";

/** `customType` of the persisted message that carries a scoped rule. */
const CUSTOM_TYPE = "claude-rule";

/** Tools whose `input.path` names the file Claude would consider "worked on". */
const FILE_TOOLS = new Set(["read", "write", "edit"]);

export interface Rule {
  /** Path below the rules root, e.g. `apply.md` or `frontend/react.md`. */
  name: string;
  /** Globs from `paths:`. Empty for an unscoped rule. */
  paths: string[];
  body: string;
}

/**
 * The globs from a `paths:` value. `parseFile` joins a block list with spaces and
 * keeps a flow list as written, so both `- "a/**"` lines and `["a/**", "b/**"]`
 * arrive here as one string.
 */
export function patterns(declared: string | undefined): string[] {
  if (declared === undefined) {
    return [];
  }
  return declared
    .replace(/^\[|\]$/g, "")
    .split(/[,\s]+/)
    .map((pattern) => pattern.trim().replace(/^(["'])(.*)\1$/, "$2"))
    .filter((pattern) => pattern.length > 0);
}

/** Every rule below `root`, sorted by name. `README.md` is documentation, not a rule. */
export function discover(root: string): Rule[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "README.md",
    )
    .map((entry) => {
      const filePath = path.join(entry.parentPath, entry.name);
      const parsed = parseFile(fs.readFileSync(filePath, "utf-8"));
      return {
        name: path.relative(root, filePath),
        paths: patterns(parsed.frontmatter.paths),
        body: parsed.body.trimEnd(),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** True when `relativePath`, relative to the project root, is inside one of the rule's globs. */
export function matches(rule: Rule, relativePath: string): boolean {
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return false;
  }
  // A trailing slash names a directory, so it stands for everything below it.
  return rule.paths.some((pattern) =>
    path.matchesGlob(
      relativePath,
      pattern.endsWith("/") ? `${pattern}**` : pattern,
    ),
  );
}

/** The system-prompt block for the unscoped rules, or an empty string when there are none. */
export function systemPromptBlock(rules: Rule[]): string {
  const unscoped = rules.filter((rule) => rule.paths.length === 0);
  if (unscoped.length === 0) {
    return "";
  }
  return [
    "# Rules from ~/.claude/rules",
    ...unscoped.map((rule) => rule.body),
  ].join("\n\n");
}

export default function claudeRules(pi: ExtensionAPI): void {
  const rules = discover(path.join(os.homedir(), ".claude", "rules"));
  const scoped = rules.filter((rule) => rule.paths.length > 0);
  const block = systemPromptBlock(rules);
  const sent = new Set<string>();

  // Rebuild the sent set from the session, so a resume, fork or /new starts from
  // what the current branch already carries.
  pi.on("session_start", (_event, ctx) => {
    sent.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom_message" && entry.customType === CUSTOM_TYPE) {
        sent.add((entry.details as { name: string }).name);
      }
    }
  });

  pi.on("before_agent_start", (event) =>
    block ? { systemPrompt: `${event.systemPrompt}\n\n${block}` } : undefined,
  );

  pi.on("tool_result", (event, ctx) => {
    const target = event.input.path;
    if (
      event.isError ||
      !FILE_TOOLS.has(event.toolName) ||
      typeof target !== "string"
    ) {
      return;
    }
    const relativePath = path.relative(ctx.cwd, path.resolve(ctx.cwd, target));
    for (const rule of scoped) {
      if (sent.has(rule.name) || !matches(rule, relativePath)) {
        continue;
      }
      sent.add(rule.name);
      pi.sendMessage(
        {
          customType: CUSTOM_TYPE,
          content: `Rule from ~/.claude/rules/${rule.name}, which applies to ${relativePath}:\n\n${rule.body}`,
          display: false,
          details: { name: rule.name },
        },
        { deliverAs: "steer" },
      );
      ctx.ui.notify(`Loaded rule ${rule.name} for ${relativePath}`, "info");
    }
  });
}
