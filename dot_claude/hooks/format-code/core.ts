/**
 * The format-code logic: finds the files a tool call changed and formats each
 * one with the formatter for its extension, from FORMATTERS: oxfmt, Org table
 * alignment in Emacs, terraform fmt, shfmt, and ruff format, one module each in
 * formatters/. Never blocks: a missing formatter or a file that does not parse
 * stays as it is. The adapters pass in the file and process functions, because
 * a mod reaches them only through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp), omp.ts
 * (omp only), command.ts (Codex, and the format-staged-files pre-commit hook).
 * Design notes: README.md.
 */

import { parent } from "./formatters/each-file.ts";
import { orgTables } from "./formatters/org-tables.ts";
import { oxfmt } from "./formatters/oxfmt.ts";
import { ruff } from "./formatters/ruff.ts";
import { shfmt } from "./formatters/shfmt.ts";
import { terraform } from "./formatters/terraform.ts";
import { COMMIT, LAST_COMMIT, shellFiles } from "./sweep.ts";

export interface Io {
  /** The kind of a path and its mtime; undefined if missing. */
  stat(path: string): Promise<{ kind: "file" | "dir" | "other"; mtimeMs: number } | undefined>;
  /** The text of a file; undefined if it cannot be read. */
  read(path: string): Promise<string | undefined>;
  /** The exit code and stdout; undefined when the program cannot start. */
  run(
    argv: string[],
    options: { cwd: string; env?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string } | undefined>;
}

export interface Settings {
  /** TMPDIR: files under it are throwaway and not formatted. */
  tmpdir?: string;
  /** AGENT_HOOKS_DISABLE: the hooks /toggle-hook turned off. */
  hooksOff?: string;
}

/**
 * The tool call: a Write or Edit names a file, a Bash call a command and the
 * time in ms before it ran, when the adapter saw it. The format-staged-files
 * pre-commit hook names all staged files in filePaths, so one run takes them
 * all.
 */
export interface Call {
  filePath?: string;
  filePaths?: string[];
  command?: string;
  since?: number;
  cwd: string;
}

/** One run of a formatter. Each run writes the files in place. */
export interface Run {
  argv: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

/** A formatter: the files it takes, and its runs for them. */
export interface Formatter {
  name: string;
  /** The git config key that turns it off: agent-hook.format-code.<key>. */
  key: string;
  /** The file extensions without the dot, for a named file. */
  extensions: string[];
  /** The extensions of the files that a Bash call changed; default: `extensions`. */
  swept?: string[];
  /** Whether a file with this text needs a run; default: each file. */
  wants?(text: string): boolean;
  /** The runs for `files`, all of this formatter. `cwd` is the folder of the call. */
  runs(files: string[], cwd: string, io: Io): Promise<Run[]>;
}

/** One module each in formatters/. toggle-hook PARTS holds the same keys. */
export const FORMATTERS: Formatter[] = [oxfmt, orgTables, terraform, shfmt, ruff];

const plain = (path: string) => path.replace(/^\/private/, "");
const extension = (file: string) => /\.([^./]+)$/.exec(file)?.[1] ?? "";
const formatterOf = (file: string, swept: boolean) =>
  FORMATTERS.find((formatter) =>
    (swept ? (formatter.swept ?? formatter.extensions) : formatter.extensions).includes(
      extension(file),
    ),
  );

/**
 * A file under /tmp, /var/tmp, or TMPDIR is a scratch file, not project
 * code. macOS resolves /tmp to /private/tmp, so both sides drop that prefix.
 */
function throwaway(file: string, { tmpdir }: Settings): boolean {
  // The slash keeps a sibling such as $TMPDIR-project out.
  const dirs = ["/tmp/", "/var/tmp/", ...(tmpdir ? [`${plain(tmpdir).replace(/\/$/, "")}/`] : [])];
  return dirs.some((dir) => plain(file).startsWith(dir));
}

/**
 * The absolute path with no dot segments, without Node imports: the Claude
 * Code mod runs this core too. oxfmt rejects a path that holds `..`, even an
 * absolute one, and one file must not count twice.
 */
function normalize(file: string, cwd: string): string {
  const parts: string[] = [];
  for (const part of (file.startsWith("/") ? file : `${cwd}/${file}`).split("/"))
    if (part === "..") parts.pop();
    else if (part !== "" && part !== ".") parts.push(part);
  return `/${parts.join("/")}`;
}

/** Whether AGENT_HOOKS_DISABLE names `name`. */
const sessionOff = (settings: Settings, name: string) =>
  (settings.hooksOff ?? "").split(/[\s,]+/).includes(name);

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
 * The files to format, each once, with their formatter. A Write or Edit: the
 * files it names. A Bash call: the files it changed, from sweep.ts, so a file
 * the command only read stays as it is. A file whose repository turns off the
 * hook or its formatter stays as it is.
 */
async function targets(call: Call, io: Io, settings: Settings): Promise<Map<Formatter, string[]>> {
  const { command, cwd, since } = call;
  const named = call.filePaths ?? (call.filePath ? [call.filePath] : undefined);
  const swept = FORMATTERS.flatMap((formatter) => formatter.swept ?? formatter.extensions);
  const paths =
    named ?? (command === undefined ? [] : await shellFiles({ command, cwd, since }, swept, io));
  const kept = new Map<Formatter, string[]>();
  // One git run for each folder and key: a commit can name many files.
  const asked = new Map<string, Promise<boolean>>();
  const off = (dir: string, key: string) => {
    const id = `${dir}\0${key}`;
    if (!asked.has(id)) asked.set(id, repoOff(dir, key, io));
    return asked.get(id)!;
  };
  for (const file of new Set(paths.map((path) => normalize(path, cwd)))) {
    const formatter = formatterOf(file, !named);
    if (!formatter || throwaway(file, settings)) continue;
    if ((await io.stat(file))?.kind !== "file") continue;
    if (formatter.wants && !formatter.wants((await io.read(file)) ?? "")) continue;
    const dir = parent(file);
    if ((await off(dir, "enabled")) || (await off(dir, formatter.key))) continue;
    kept.set(formatter, [...(kept.get(formatter) ?? []), file]);
  }
  return kept;
}

/**
 * Formats the files a call changed. Returns the amend hint for the model
 * when the call committed a file that a formatter then changed, else
 * undefined. README "Write and commit in one command".
 */
export async function format(call: Call, io: Io, settings: Settings): Promise<string | undefined> {
  if (sessionOff(settings, "format-code")) return undefined;
  // A command that commits: the hint then checks the last commit.
  const commits = !call.filePath && COMMIT.test(call.command ?? "");
  const dirty: string[] = [];
  const names = new Set<string>();
  for (const [formatter, files] of await targets(call, io, settings)) {
    // The hint names only the files that the formatter changed, so keep the
    // text from before the run.
    const before = commits ? await Promise.all(files.map((file) => io.read(file))) : [];
    for (const run of await formatter.runs(files, call.cwd, io))
      await io.run(run.argv, { cwd: run.cwd, env: run.env, timeoutMs: run.timeoutMs ?? 10_000 });
    for (const [i, file] of commits ? files.entries() : []) {
      if ((await io.read(file)) === before[i]) continue;
      // Only a file that the last commit holds needs an amend.
      const held = await io.run(["git", ...LAST_COMMIT, "HEAD", "--", file], {
        cwd: parent(file),
      });
      if (!held?.stdout.trim()) continue;
      dirty.push(file);
      names.add(formatter.name);
    }
  }
  if (!dirty.length) return undefined;
  return `${[...names].join(" and ")} reformatted files after your commit, so the commit holds the unformatted version and the working tree is now dirty: ${dirty.join(" ")}. Fold the formatting into that commit (amend, or a fixup commit if it is already pushed).`;
}
