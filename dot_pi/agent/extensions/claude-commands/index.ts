/**
 * Claude Commands Extension
 *
 * Registers every `~/.claude/commands/**\/*.md` file as a pi slash command, named
 * by its path: `git/commit/single.md` becomes `/git:commit:single`. pi's own
 * `prompts` setting and the `promptPaths` resource hook both name a file by its
 * basename alone, which drops `git/branches/cleanup.md` or `git/worktrees/cleanup.md`
 * without a warning. Registering each file directly is what keeps both, and it keeps
 * the name Claude already uses.
 *
 * The handler expands the body the way Claude does, then sends it as a user message.
 * Expansion covers what the command files use: `$ARGUMENTS`, `$ARGUMENTS[N]` and its
 * `$N` shorthand, `$name` for a name declared in `arguments:`, and `` !`cmd` `` spans.
 * Arguments are substituted before the spans run, so `!`gh issue view $ARGUMENTS``
 * works.
 *
 * Not carried over, and why:
 * - `allowed-tools`: pi has no permission system, so there is nothing to pre-approve.
 * - `disable-model-invocation`: pi has no model-facing slash-command tool, so every
 *   command here is user-invoked already. The safe direction.
 * - `@file` inlining, `${CLAUDE_*}` variables and ```` ```! ```` blocks: no command
 *   file uses them.
 *
 * Reference: https://code.claude.com/docs/en/slash-commands, and pi-code's
 * `extensions/commands.ts` for the contract this reproduces a subset of.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Claude's own budget for one dynamic-context command. */
const SPAN_TIMEOUT_MS = 120_000;

interface CommandFile {
	/** Invocation name without the leading slash, e.g. `git:commit:single`. */
	name: string;
	filePath: string;
	description?: string;
	argumentHint?: string;
}

interface ParsedFile {
	frontmatter: Record<string, string>;
	/** Names from `arguments:`, in position order, for `$name` substitution. */
	argumentNames: string[];
	body: string;
}

/**
 * Frontmatter as a flat string map, plus the body. Every value the command files use
 * is a one-line scalar or a list, so a key whose value is empty absorbs the `- item`
 * lines below it as a space-joined string. That is enough for `arguments:` in either
 * YAML spelling, and it avoids pulling in a YAML parser.
 */
export function parseFile(text: string): ParsedFile {
	const lines = text.split("\n");
	if (lines[0] !== "---") {
		return { frontmatter: {}, argumentNames: [], body: text };
	}
	const end = lines.indexOf("---", 1);
	if (end === -1) {
		return { frontmatter: {}, argumentNames: [], body: text };
	}
	const frontmatter: Record<string, string> = {};
	const head = lines.slice(1, end);
	for (let index = 0; index < head.length; index += 1) {
		const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(head[index]);
		if (!match) {
			continue;
		}
		let value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
		if (value === "") {
			const items: string[] = [];
			while (index + 1 < head.length) {
				const item = /^\s*-\s*(.+)$/.exec(head[index + 1]);
				if (!item) {
					break;
				}
				items.push(item[1].trim().replace(/^(["'])(.*)\1$/, "$2"));
				index += 1;
			}
			value = items.join(" ");
		}
		frontmatter[match[1]] = value;
	}
	return {
		frontmatter,
		argumentNames: argumentNames(frontmatter.arguments),
		body: lines.slice(end + 1).join("\n").replace(/^\n+/, ""),
	};
}

/**
 * The `arguments:` names in position order. Claude accepts a space-separated string
 * or a YAML list, so a flow list keeps its brackets here and is stripped.
 */
function argumentNames(declared: string | undefined): string[] {
	if (declared === undefined) {
		return [];
	}
	return declared
		.replace(/^\[|\]$/g, "")
		.split(/[,\s]+/)
		.map((name) => name.trim())
		.filter((name) => /^[A-Za-z_]\w*$/.test(name));
}

/**
 * The invocation name for a file below the commands root. Directories become `:`
 * segments, so the name matches what Claude registers. A `name:` in frontmatter
 * replaces the leaf only, not the path.
 */
export function commandName(relativePath: string, declared?: string): string {
	const segments = relativePath.split(path.sep);
	const file = segments.pop();
	if (file === undefined) {
		return "";
	}
	const leaf = declared?.trim() || path.basename(file, ".md");
	return [...segments, leaf].join(":");
}

/**
 * The first line of a body as a description, for a file with no `description:`.
 * Claude falls back this way too: `dead-code.md` has no frontmatter and Claude
 * lists it by its `# Refactor Clean` heading.
 */
function firstLine(body: string): string | undefined {
	const line = body.split("\n").find((candidate) => candidate.trim().length > 0);
	return line?.replace(/^#+\s*/, "").trim() || undefined;
}

/** Every command file below `root`. `README.md` documents a directory, it is not a command. */
export function discover(root: string): CommandFile[] {
	const found: CommandFile[] = [];
	const walk = (dir: string, prefix: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const relative = prefix ? path.join(prefix, entry.name) : entry.name;
			if (entry.isDirectory()) {
				walk(path.join(dir, entry.name), relative);
				continue;
			}
			if (!entry.name.endsWith(".md") || entry.name === "README.md") {
				continue;
			}
			const filePath = path.join(dir, entry.name);
			let parsed: ParsedFile;
			try {
				parsed = parseFile(fs.readFileSync(filePath, "utf-8"));
			} catch {
				continue;
			}
			const name = commandName(relative, parsed.frontmatter.name);
			if (name) {
				found.push({
					name,
					filePath,
					description: parsed.frontmatter.description ?? firstLine(parsed.body),
					argumentHint: parsed.frontmatter["argument-hint"],
				});
			}
		}
	};
	walk(root, "");
	return found;
}

/** Split an argument string shell-style, keeping a quoted run together. */
function splitArgs(args: string): string[] {
	const parts: string[] = [];
	const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (let match = pattern.exec(args); match !== null; match = pattern.exec(args)) {
		parts.push(match[1] ?? match[2] ?? match[3]);
	}
	return parts;
}

function escapeForRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One alternation over every placeholder plus the two escape forms. Order is
 * load-bearing: the escapes first so `\$1` never expands, and `$ARGUMENTS[N]`
 * before the bare `$ARGUMENTS` so the index is not read as literal brackets.
 * `(?!)` never matches, standing in when a file declares no names.
 */
function argPattern(names: string[]): RegExp {
	const declared = names.length > 0 ? names.map(escapeForRegExp).join("|") : "(?!)";
	return new RegExp(
		String.raw`\\{2}(?=\$)` +
			String.raw`|\\\$(?=\d|ARGUMENTS\b|(?:${declared})\b)` +
			String.raw`|\$ARGUMENTS\[(\d+)\]` +
			String.raw`|\$ARGUMENTS\b` +
			String.raw`|\$(\d+)` +
			String.raw`|\$(${declared})\b`,
		"g",
	);
}

/**
 * Claude's argument substitution. `$ARGUMENTS` is everything typed. Indexed forms
 * are 0-based, so `$0` is the first argument, and an index with no argument stays
 * literal rather than becoming empty.
 *
 * A `$name` declared in `arguments:` takes the argument at its position and becomes
 * empty when there is none, unlike an index, which stays literal.
 *
 * `consumed` reports whether any placeholder read the arguments, which drives the
 * `ARGUMENTS:` append Claude adds when a command ignores what was typed. A name
 * counts even when its position is empty, because it did expand.
 */
export function substituteArgs(body: string, args: string, names: string[] = []): { text: string; consumed: boolean } {
	const parts = splitArgs(args);
	const all = args.trim();
	let consumed = false;
	const fill = (value: string | undefined, orElse: string): string => {
		if (value === undefined) {
			return orElse;
		}
		consumed = true;
		return value;
	};
	const text = body.replaceAll(argPattern(names), (token, bracketIndex?: string, shorthandIndex?: string, name?: string) => {
		if (token === "\\\\") {
			return token;
		}
		if (token === "\\$") {
			return "$";
		}
		if (bracketIndex !== undefined) {
			return fill(parts[Number(bracketIndex)], token);
		}
		if (shorthandIndex !== undefined) {
			return fill(parts[Number(shorthandIndex)], token);
		}
		if (name !== undefined) {
			consumed = true;
			return fill(parts[names.indexOf(name)], "");
		}
		consumed = true;
		return all;
	});
	return { text, consumed };
}

/** Character ranges covered by fenced code blocks, where a `!` span is sample text. */
function fencedRanges(text: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	let open: number | undefined;
	let offset = 0;
	for (const line of text.split("\n")) {
		if (/^\s*```/.test(line)) {
			if (open === undefined) {
				open = offset;
			} else {
				ranges.push([open, offset + line.length]);
				open = undefined;
			}
		}
		offset += line.length + 1;
	}
	if (open !== undefined) {
		ranges.push([open, text.length]);
	}
	return ranges;
}

type Exec = (script: string) => Promise<{ stdout: string; stderr: string; code: number }>;

/**
 * Run every `` !`cmd` `` span and replace it with the output. `!` counts only at the
 * start of a line or after whitespace, so `KEY=!`cmd`` stays literal, and a span
 * inside a fenced block is sample text.
 *
 * A span that fails aborts the invocation, as Claude does: a command whose context
 * block is empty would otherwise reach the model looking complete.
 */
export async function expandSpans(text: string, exec: Exec): Promise<string> {
	const fenced = fencedRanges(text);
	const pattern = /(^|\s)!`([^`]+)`/g;
	let result = "";
	let cursor = 0;
	for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
		const index = match.index;
		if (fenced.some(([start, end]) => index >= start && index < end)) {
			continue;
		}
		const [span, lead, script] = match;
		const run = await exec(script);
		if (run.code !== 0) {
			throw new Error(`\`${script}\` exited ${run.code}: ${(run.stderr || run.stdout).trim()}`);
		}
		result += text.slice(cursor, index) + lead + (run.stdout + run.stderr).trimEnd();
		cursor = index + span.length;
	}
	return result + text.slice(cursor);
}

/** A command file as the text that goes to the model. */
export async function expand(filePath: string, args: string, exec: Exec): Promise<string> {
	const { body, argumentNames: names } = parseFile(fs.readFileSync(filePath, "utf-8"));
	const { text, consumed } = substituteArgs(body, args, names);
	const expanded = await expandSpans(text, exec);
	return args.trim() && !consumed ? `${expanded}\n\nARGUMENTS: ${args.trim()}` : expanded;
}

export default function claudeCommandsExtension(pi: ExtensionAPI) {
	const root = path.join(os.homedir(), ".claude", "commands");

	for (const command of discover(root)) {
		const description = [command.description, command.argumentHint && `(${command.argumentHint})`].filter(Boolean).join(" ");
		pi.registerCommand(command.name, {
			...(description ? { description } : {}),
			handler: async (args: string, ctx: ExtensionCommandContext) => {
				// stderr is kept separate here and merged into the span output, because
				// appending `2>&1` to the script would bind to its last command only.
				const exec: Exec = async (script) => pi.exec("/bin/sh", ["-c", script], { cwd: ctx.cwd, timeout: SPAN_TIMEOUT_MS });
				try {
					pi.sendUserMessage(await expand(command.filePath, args, exec));
				} catch (error) {
					ctx.ui.notify(`/${command.name} failed: ${error instanceof Error ? error.message : String(error)}`, "error");
				}
			},
		});
	}
}
