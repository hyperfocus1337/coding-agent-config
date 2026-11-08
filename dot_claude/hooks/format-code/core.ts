/**
 * The format-code logic: finds the files a tool call changed and formats
 * each one with the formatter for its extension, from FORMATTERS: terraform
 * fmt, shfmt, and ruff format, one module each in formatters/. oxfmt has no
 * parser for these languages, so
 * format-oxfmt skips them. Never blocks: a missing formatter or a file
 * that does not parse stays as it is. The adapters pass in the file and
 * process functions, because a mod reaches them only through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp), omp.ts
 * (omp only), command.ts (Codex, and the format-staged-files pre-commit hook).
 * Design notes: README.md.
 */

import { ruff } from "./formatters/ruff.ts";
import { shfmt } from "./formatters/shfmt.ts";
import { terraform } from "./formatters/terraform.ts";

export interface Io {
  /** The kind of a path and its mtime; undefined if missing. */
  stat(path: string): Promise<{ kind: "file" | "dir" | "other"; mtimeMs: number } | undefined>;
  /** The exit code and stdout; undefined when the program cannot start. */
  run(
    argv: string[],
    options: { cwd: string; timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string } | undefined>;
}

export interface Settings {
  /** TMPDIR: files under it are throwaway and not formatted. */
  tmpdir?: string;
  /** AGENT_HOOKS_DISABLE: the hooks /toggle-hook turned off. */
  hooksOff?: string;
}

/**
 * The tool call: a Write or Edit names a file, a Bash call a command. The
 * format-staged-files pre-commit hook names all staged files in filePaths, so
 * one run takes them all.
 */
export interface Call {
  filePath?: string;
  filePaths?: string[];
  command?: string;
  cwd: string;
}

/**
 * A formatter: the files it takes, and its command for one file. Each
 * command writes the file in place and exits 0. A file that does not parse
 * exits other than 0.
 */
export interface Formatter {
  name: string;
  /** The git config key that turns it off: agent-hook.format-code.<key>. */
  key: string;
  /** File extensions without the dot. */
  extensions: string[];
  argv(file: string, io: Io): Promise<string[]>;
  /** Whether the stdout of a run tells of a change; default: not empty. */
  changed?(stdout: string): boolean;
}

/** One module each in formatters/. toggle-hook PARTS holds the same keys. */
export const FORMATTERS: Formatter[] = [terraform, shfmt, ruff];

/**
 * A command that commits: `git`, then global options such as `-C <dir>`, then
 * `commit` as a word, in one simple command. `git commit-tree` does not match.
 */
const COMMIT = /\bgit[ \t](?:[^;&|\n]*[ \t])?commit(?![\w-])/;

/** A path that a command names, with an extension of FORMATTERS. */
const NAMED = new RegExp(
  `${/[^\s:;|&"'`()<>=]+\./.source}(?:${FORMATTERS.flatMap((f) => f.extensions).join("|")})\\b`,
  "g",
);

const plain = (path: string) => path.replace(/^\/private/, "");
const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const formatterOf = (file: string) => {
  const extension = /\.([^./]+)$/.exec(file)?.[1];
  return FORMATTERS.find(({ extensions }) => extension && extensions.includes(extension));
};

/**
 * A file under /tmp, /var/tmp, or TMPDIR is a scratch file, not project
 * code. macOS resolves /tmp to /private/tmp, so both sides drop that prefix.
 */
function throwaway(file: string, { tmpdir }: Settings): boolean {
  const dirs = ["/tmp/", "/var/tmp/", ...(tmpdir ? [plain(tmpdir)] : [])];
  return dirs.some((dir) => plain(file).startsWith(dir));
}

/**
 * Whether the git config of the repository that holds `dir` sets
 * agent-hook.format-code.<key> to false. /toggle-hook --repo writes the
 * `enabled` key for the whole hook, and a FORMATTERS key for one formatter.
 * Outside git, a missing key, or a value that is not a boolean: false.
 */
async function repoOff(dir: string, key: string, io: Io): Promise<boolean> {
  const ran = await io.run(
    ["git", "config", "--type=bool", "--get", `agent-hook.format-code.${key}`],
    { cwd: dir },
  );
  return ran?.stdout.trim() === "false";
}

/**
 * The files to format, each once. A Write or Edit: the file it names. A Bash
 * call: the paths its command names that it just wrote, by an mtime of at
 * most 120 s, so a file the command only read stays as it is. A file whose
 * repository turns off the hook or its formatter stays as it is.
 * shortcut: a command that writes early and then runs for minutes falls
 * outside the window. The upgrade is a start time stamped before the call.
 */
async function targets(call: Call, io: Io, settings: Settings): Promise<string[]> {
  const given = call.filePaths ?? (call.filePath ? [call.filePath] : undefined);
  const paths =
    given ??
    [...(call.command ?? "").matchAll(NAMED)].map(([named]) =>
      named.startsWith("/") ? named : `${call.cwd}/${named}`,
    );
  const kept: string[] = [];
  // One git run for each folder and key: a commit can name many files.
  const asked = new Map<string, Promise<boolean>>();
  const off = (dir: string, key: string) => {
    const id = `${dir}\0${key}`;
    if (!asked.has(id)) asked.set(id, repoOff(dir, key, io));
    return asked.get(id)!;
  };
  for (const file of new Set(paths)) {
    const formatter = formatterOf(file);
    if (!formatter || throwaway(file, settings)) continue;
    const stat = await io.stat(file);
    if (stat?.kind !== "file" || (!given && Date.now() - stat.mtimeMs > 120_000)) continue;
    const dir = parent(file);
    if ((await off(dir, "enabled")) || (await off(dir, formatter.key))) continue;
    kept.push(file);
  }
  return kept;
}

/**
 * Formats the files a call changed. Returns the amend hint for the model
 * when the call committed a file that a formatter then changed, else
 * undefined. README "Write and commit in one command".
 */
export async function format(call: Call, io: Io, settings: Settings): Promise<string | undefined> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes("format-code")) return undefined;
  // A command that commits: the hint then checks the last commit.
  const commits = !call.filePath && COMMIT.test(call.command ?? "");
  const dirty: string[] = [];
  const names = new Set<string>();
  for (const file of await targets(call, io, settings)) {
    const formatter = formatterOf(file)!;
    // One run for each file: a file that does not parse makes terraform fmt
    // exit 2 and skip the files after it. A run takes about 15 ms.
    const dir = parent(file);
    const ran = await io.run(await formatter.argv(file, io), {
      cwd: dir,
      timeoutMs: 10_000,
    });
    const changed = formatter.changed ?? ((stdout) => stdout.trim() !== "");
    if (!commits || ran?.exitCode !== 0 || !changed(ran.stdout)) continue;
    // Only a file that the last commit holds needs an amend. diff-tree --root
    // also answers for the first commit of a repository.
    const held = await io.run(
      ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "--root", "HEAD", "--", file],
      { cwd: dir },
    );
    if (!held?.stdout.trim()) continue;
    dirty.push(file);
    names.add(formatter.name);
  }
  if (!dirty.length) return undefined;
  return `${[...names].join(" and ")} reformatted files after your commit, so the commit holds the unformatted version and the working tree is now dirty: ${dirty.join(" ")}. Fold the formatting into that commit (amend, or a fixup commit if it is already pushed).`;
}
