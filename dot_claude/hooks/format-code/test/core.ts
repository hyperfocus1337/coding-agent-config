/**
 * Unit cases for ../core.ts with a stub Io: the session and repository toggles, the file
 * selection, and the paths. They need no formatter. check.ts runs them.
 */
import assert from "node:assert/strict";
import { format, type Io } from "../core.ts";

/**
 * An Io where each path is a file with `text`. `git config --get <key>` prints `config[key]`.
 * `ran` records each run.
 */
const stub = (ran: string[][], config: Record<string, string> = {}, text = "| a |\n"): Io => ({
  stat: async () => ({ kind: "file", mtimeMs: Date.now() }),
  read: async () => text,
  run: async (argv) => {
    ran.push(argv);
    const value = argv[1] === "config" ? config[argv.at(-1)!] : undefined;
    return { exitCode: 0, stdout: value ? `${value}\n` : "" };
  },
});
/** The programs other than git that a call of `format` runs. */
const formatters = async (
  call: Parameters<typeof format>[0],
  config: Record<string, string> = {},
  hooksOff?: string,
  text?: string,
) => {
  const ran: string[][] = [];
  await format(call, stub(ran, config, text), { hooksOff });
  return ran.filter(([program]) => program !== "git");
};
const programs = async (...args: Parameters<typeof formatters>) =>
  (await formatters(...args)).map(([program]) => program);

const files = { filePaths: ["/x/a.md", "/x/a.org", "/x/a.tf"], cwd: "/x" };
assert.deepEqual(await programs(files), ["oxfmt", "emacs", "terraform"]);

// AGENT_HOOKS_DISABLE that names the hook.
assert.deepEqual(await programs(files, {}, "lint-code format-code"), []);

// git config: the hook, or one formatter. A value other than false keeps it on.
assert.deepEqual(await programs(files, { "agent-hook.format-code.enabled": "false" }), []);
assert.deepEqual(await programs(files, { "agent-hook.format-code.oxfmt": "false" }), [
  "emacs",
  "terraform",
]);
assert.deepEqual(await programs(files, { "agent-hook.format-code.oxfmt": "true" }), [
  "oxfmt",
  "emacs",
  "terraform",
]);

// An Org file with no line that starts with `|` holds no table: no Emacs.
assert.deepEqual(await programs({ filePath: "/x/a.org", cwd: "/x" }, {}, undefined, "* a\n"), []);

// A named .md file goes to oxfmt, and so does a .ts file. A Bash call sweeps Markdown only, so a
// .ts path that the command names stays as it is.
assert.deepEqual(await programs({ filePath: "/x/a.ts", cwd: "/x" }), ["oxfmt"]);
assert.deepEqual(await programs({ command: "touch /x/a.ts", cwd: "/x" }), []);

// oxfmt takes all its files in one run, and each path only once, without dot segments, which
// oxfmt rejects.
assert.deepEqual(
  await formatters({
    cwd: "/x/sub",
    filePaths: ["../a.md", "/x/sub/../a.md", "/x/./a.md", "/../../x/a.md", "/x/b.md"],
  }),
  [["oxfmt", "/x/a.md", "/x/b.md"]],
);
// The dot segments go before the scratch-file filter.
assert.deepEqual(await formatters({ cwd: "/x", filePath: "/x/../tmp/a.md" }), []);
