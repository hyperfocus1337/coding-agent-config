/**
 * Self-check for ../index.ts.
 *
 * Run: node test/check.ts, from the extension directory, or `just pi-check`.
 *
 * Node strips the types, so this needs no build step and no dependency. The last
 * group runs against the real ~/.claude/commands, so it also reports whether the
 * installed tree still matches what the extension was written against.
 */

import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import { commandName, discover, expandSpans, parseFile, substituteArgs } from "../index.ts";

let checks = 0;
async function check(what: string, run: () => void | Promise<void>): Promise<void> {
	checks += 1;
	try {
		await run();
	} catch (error) {
		console.error(`FAIL ${what}\n  ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}

// ── Names ─────────────────────────────────────────────────────────────────────

await check("a nested file is named by its path", () => {
	assert.equal(commandName(path.join("git", "commit", "single.md")), "git:commit:single");
});

await check("a root file keeps its basename", () => {
	assert.equal(commandName("chezmoi.md"), "chezmoi");
});

await check("the two cleanup.md files get distinct names", () => {
	assert.notEqual(commandName(path.join("git", "branches", "cleanup.md")), commandName(path.join("git", "worktrees", "cleanup.md")));
});

await check("frontmatter name replaces the leaf, not the path", () => {
	assert.equal(commandName(path.join("issues", "improve-issue.md"), "renamed"), "issues:renamed");
});

// ── Frontmatter ───────────────────────────────────────────────────────────────

await check("frontmatter keys and body are split", () => {
	const parsed = parseFile('---\ndescription: Do a thing\nargument-hint: <task>\n---\n\nBody line.\n');
	assert.equal(parsed.frontmatter.description, "Do a thing");
	assert.equal(parsed.frontmatter["argument-hint"], "<task>");
	assert.equal(parsed.body, "Body line.\n");
});

await check("a file with no frontmatter is all body", () => {
	assert.equal(parseFile("Just prose.\n").body, "Just prose.\n");
	assert.deepEqual(parseFile("Just prose.\n").frontmatter, {});
});

await check("a --- inside the body does not end the frontmatter early", () => {
	const parsed = parseFile("---\ndescription: x\n---\n\nIntro\n\n---\n\nMore\n");
	assert.equal(parsed.frontmatter.description, "x");
	assert.match(parsed.body, /More/);
});

// ── Arguments ─────────────────────────────────────────────────────────────────

await check("$ARGUMENTS takes everything typed", () => {
	const { text, consumed } = substituteArgs("Fix $ARGUMENTS now.", "issue 42");
	assert.equal(text, "Fix issue 42 now.");
	assert.equal(consumed, true);
});

await check("$N is 0-based, as Claude documents", () => {
	assert.equal(substituteArgs("$0 then $1", 'first "second word"').text, "first then second word");
});

await check("$ARGUMENTS[N] matches its $N shorthand", () => {
	assert.equal(substituteArgs("$ARGUMENTS[1]", "a b").text, substituteArgs("$1", "a b").text);
});

await check("an index with no argument stays literal", () => {
	const { text, consumed } = substituteArgs("$0 and $2", "only");
	assert.equal(text, "only and $2");
	assert.equal(consumed, true);
});

await check("a body that reads nothing does not count as consuming", () => {
	assert.equal(substituteArgs("No placeholder here.", "typed").consumed, false);
});

await check("\\$ escapes a placeholder", () => {
	assert.equal(substituteArgs(String.raw`costs \$1.00`, "arg").text, "costs $1.00");
});

await check("a doubled backslash keeps both and still expands", () => {
	assert.equal(substituteArgs(String.raw`\\$0`, "x").text, String.raw`\\x`);
});

// ── Named arguments ───────────────────────────────────────────────────────────

await check("a flow list declares names in order", () => {
	assert.deepEqual(parseFile("---\narguments: [author, count]\n---\n\nx\n").argumentNames, ["author", "count"]);
});

await check("a block list declares the same names", () => {
	assert.deepEqual(parseFile("---\narguments:\n  - author\n  - count\n---\n\nx\n").argumentNames, ["author", "count"]);
});

await check("a space-separated string declares the same names", () => {
	assert.deepEqual(parseFile("---\narguments: author count\n---\n\nx\n").argumentNames, ["author", "count"]);
});

await check("a file with no arguments: declares none", () => {
	assert.deepEqual(parseFile("---\ndescription: x\n---\n\nbody\n").argumentNames, []);
});

await check("$name takes the argument at its position", () => {
	const { text } = substituteArgs('--author="$author" HEAD~$count', '"A B <a@b.c>" 5', ["author", "count"]);
	assert.equal(text, '--author="A B <a@b.c>" HEAD~5');
});

await check("a name with no argument becomes empty and still counts", () => {
	const { text, consumed } = substituteArgs("HEAD~$count", "", ["author", "count"]);
	assert.equal(text, "HEAD~");
	assert.equal(consumed, true);
});

await check("an undeclared name stays literal", () => {
	assert.equal(substituteArgs("$CURRENT_DATE and $NEW_DATE", "x", ["hours"]).text, "$CURRENT_DATE and $NEW_DATE");
});

await check("a name needs a word boundary, so -v$hoursH does not expand", () => {
	// This is why shift-dates.md writes -v"$hours"H rather than -v$hoursH.
	assert.equal(substituteArgs('-v$hoursH vs -v"$hours"H', "+2", ["hours"]).text, '-v$hoursH vs -v"+2"H');
});

await check("\\$name escapes a declared name", () => {
	assert.equal(substituteArgs(String.raw`\$author`, "A", ["author"]).text, "$author");
});

// ── Spans ─────────────────────────────────────────────────────────────────────

const fakeExec = (stdout: string, code = 0) => async () => ({ stdout, stderr: "", code });

await check("a span is replaced by its output", async () => {
	assert.equal(await expandSpans("- Branch: !`git branch --show-current`", fakeExec("main\n")), "- Branch: main");
});

await check("a span at the start of a line is found", async () => {
	assert.equal(await expandSpans("!`date`", fakeExec("2026-09-19")), "2026-09-19");
});

await check("a span not preceded by whitespace stays literal", async () => {
	const text = "KEY=!`date`";
	assert.equal(await expandSpans(text, fakeExec("never")), text);
});

await check("a span inside a fenced block is sample text", async () => {
	const text = "Prose\n\n```\n- Branch: !`git branch`\n```\n";
	assert.equal(await expandSpans(text, fakeExec("never")), text);
});

await check("a failing span aborts the invocation", async () => {
	await assert.rejects(() => expandSpans("!`false`", fakeExec("", 1)), /exited 1/);
});

await check("arguments reach a span, because they are substituted first", () => {
	assert.equal(substituteArgs("!`gh issue view $ARGUMENTS`", "42").text, "!`gh issue view 42`");
});

// ── The installed tree ────────────────────────────────────────────────────────

const root = path.join(os.homedir(), ".claude", "commands");
const found = discover(root);

await check("commands are discovered", () => {
	assert.ok(found.length > 0, `no command files under ${root}`);
});

await check("every name is unique", () => {
	const names = found.map((command) => command.name);
	const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
	assert.deepEqual(duplicates, [], `colliding names: ${duplicates.join(", ")}`);
});

await check("README.md is not a command", () => {
	assert.equal(
		found.filter((command) => command.name.endsWith("README")).length,
		0,
	);
});

await check("the previously colliding commands all survive", () => {
	const names = new Set(found.map((command) => command.name));
	for (const name of ["git:branches:cleanup", "git:worktrees:cleanup", "git:push", "git:commit:push", "git:commit:single"]) {
		assert.ok(names.has(name), `missing /${name}`);
	}
});

await check("every command carries a description, from frontmatter or the first heading", () => {
	const missing = found.filter((command) => !command.description).map((command) => command.name);
	assert.deepEqual(missing, [], `no description: ${missing.join(", ")}`);
});

await check("a file with no frontmatter falls back to its heading", () => {
	assert.equal(found.find((command) => command.name === "code:cleanup:dead-code")?.description, "Refactor Clean");
});

console.log(`${checks} checks, ${found.length} commands discovered under ${root}`);
if (process.exitCode) {
	console.error("FAILED");
}
