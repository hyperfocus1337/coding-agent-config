/**
 * The format-oxfmt logic: finds the files a tool call changed, formats them
 * with oxfmt, and writes the amend hint. Never blocks: a missing oxfmt or a
 * parse error leaves the files as they are. The adapters pass in the file and
 * process functions, because a mod reaches them only through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp),
 * command.ts (Codex, and the format-staged-files pre-commit hook).
 * Design notes: README.md.
 */

import { COMMIT, LAST_COMMIT, shellFiles } from "./sweep.ts";

export interface Io {
  /** The kind of a path and its mtime; undefined if missing. */
  stat(path: string): Promise<{ kind: "file" | "dir" | "other"; mtimeMs: number } | undefined>;
  /** The text of a file; undefined if it cannot be read. */
  read(path: string): Promise<string | undefined>;
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

/** The extensions oxfmt formats after a Write or an Edit. README "Supported extensions". */
const EDITED =
  /\.(md|markdown|js|jsx|ts|tsx|mts|cts|mjs|cjs|json|jsonc|json5|css|scss|less|html|yml|yaml|toml)$/;
/** A Bash call takes Markdown only. README "Bash (markdown sweep)". */
const MARKDOWN = ["md", "markdown"];
/** Whether a command commits: the hint then checks the last commit. */
const commits = (call: Call) => !call.filePath && COMMIT.test(call.command ?? "");

/** Whether AGENT_HOOKS_DISABLE names the hook. */
const sessionOff = (settings: Settings) =>
  (settings.hooksOff ?? "").split(/[\s,]+/).includes("format-oxfmt");

/**
 * A file under /tmp, /var/tmp, or TMPDIR is a scratch file, not project code.
 * macOS resolves /tmp to /private/tmp, so both sides drop that prefix.
 */
function throwaway(file: string, settings: Settings): boolean {
  // The slash keeps a sibling such as $TMPDIR-project out.
  const tmpdir = (settings.tmpdir || "/nonexistent").replace(/^\/private/, "").replace(/\/$/, "");
  const plain = file.replace(/^\/private/, "");
  return (
    plain.startsWith("/tmp/") || plain.startsWith("/var/tmp/") || plain.startsWith(`${tmpdir}/`)
  );
}

/** Fold dot segments without Node imports: the Claude Code mod runs this core too. */
function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/"))
    if (part === "..") parts.pop();
    else if (part !== "" && part !== ".") parts.push(part);
  return `/${parts.join("/")}`;
}

const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

/**
 * A boolean git config key as the repository that holds `dir` reads it, with
 * the global config: "true", "false", or "" when the key is unset, the value
 * is not a boolean, or git cannot start.
 */
async function gitBool(dir: string, key: string, io: Io): Promise<string> {
  const ran = await io.run(["git", "config", "--type=bool", "--get", key], {
    cwd: dir,
  });
  return ran?.stdout.trim() ?? "";
}

/**
 * The files to format, each once. A Write or Edit: the file it names, by
 * EDITED. A Bash call: the Markdown files it changed, from sweep.ts. A file whose
 * repository sets agent-hook.format-oxfmt.enabled to false, as /toggle-hook
 * --repo does, stays as it is.
 */
async function targets(call: Call, io: Io, settings: Settings): Promise<string[]> {
  const named = call.filePaths ?? (call.filePath ? [call.filePath] : undefined);
  // oxfmt rejects any path containing `..`, even an absolute one. Normalize
  // before deduplication and filtering so all adapters and the sweep agree.
  const { command, cwd, since } = call;
  const files =
    named ?? (command === undefined ? [] : await shellFiles({ command, cwd, since }, MARKDOWN, io));
  const candidates = files.map((file) => normalize(file.startsWith("/") ? file : `${cwd}/${file}`));
  const kept: string[] = [];
  // One git run for each folder: a commit can name many files.
  const asked = new Map<string, Promise<string>>();
  for (const file of new Set(candidates)) {
    if (
      (named && !EDITED.test(file)) ||
      throwaway(file, settings) ||
      (await io.stat(file))?.kind !== "file"
    )
      continue;
    const dir = parent(file);
    if (!asked.has(dir)) asked.set(dir, gitBool(dir, "agent-hook.format-oxfmt.enabled", io));
    if ((await asked.get(dir)) !== "false") kept.push(file);
  }
  return kept;
}

/**
 * Formats the files a call changed. Returns the amend hint for the model when
 * the call committed a Markdown file that oxfmt then changed, else undefined.
 * README "Write and commit in one command".
 */
export async function format(call: Call, io: Io, settings: Settings): Promise<string | undefined> {
  if (sessionOff(settings)) return undefined;
  const files = await targets(call, io, settings);
  if (!files.length) return undefined;
  // The hint names only the files that oxfmt itself changed, so keep the text
  // from before the run. A commit sweep holds only Markdown.
  const watched = commits(call) ? files : [];
  const before = await Promise.all(watched.map((file) => io.read(file)));
  // oxfmt uses the nearest config of each file, else its defaults. README
  // "Config".
  const ran = await io.run(["oxfmt", ...files], {
    cwd: call.cwd,
    timeoutMs: 20_000,
  });
  if (!ran) return undefined;
  const dirty: string[] = [];
  for (const [i, file] of watched.entries()) {
    if ((await io.read(file)) === before[i]) continue;
    // Only a file that the last commit holds needs an amend.
    const held = await io.run(["git", ...LAST_COMMIT, "HEAD", "--", file], {
      cwd: parent(file),
    });
    if (held?.stdout.trim()) dirty.push(file);
  }
  if (!dirty.length) return undefined;
  return `oxfmt reformatted markdown after your commit, so the commit holds the unformatted version and the working tree is now dirty: ${dirty.join(" ")}. Fold the formatting into that commit (amend, or a fixup commit if it is already pushed).`;
}
