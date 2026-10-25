/**
 * The shared part of format-prettier and format-oxfmt: finds the files a
 * tool call changed, decides which of the two hooks formats them, runs the
 * formatter, and writes the amend hint. Never blocks: a missing formatter or
 * a parse error leaves the files as they are. The adapters pass in the file
 * and process functions, because a mod reaches them only through `$`.
 *
 * The same file is in both hook folders, because a Claude Code mod imports
 * only files inside its own plugin. format-oxfmt/test/check.ts keeps the two
 * copies the same. Design notes: README.md of each hook.
 */

export interface Io {
  /** The kind of a path; undefined if missing. */
  stat(path: string): Promise<{ kind: "file" | "dir" | "other" } | undefined>;
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

/** What one of the two hooks runs. */
export interface Formatter {
  /** The hook name, in AGENT_HOOKS_DISABLE and in git config. */
  hook: "format-prettier" | "format-oxfmt";
  /** The program name in the amend hint. */
  name: string;
  /** The extensions it formats after a Write or an Edit. */
  edited: RegExp;
  /** The command lines that format `files`, each run in the session folder. */
  argvs(files: string[], io: Io): Promise<string[][]>;
}

/** The Bash sweep takes Markdown only. README "Bash (markdown sweep)". */
const MARKDOWN = /\.(md|markdown)$/;
/** A Markdown path that a command names. */
const NAMED = /[^\s:;|&"'`()<>=]+\.(?:md|markdown)\b/g;
/**
 * An absolute path in a command: a root for the sweep. The `/` starts a word,
 * so the end of a relative path such as `docs/a.md` does not match.
 */
const ABSOLUTE = /(?<![^\s"'`=(;|&<>])\/[^\s:;|&"'`()<>]+/g;
/**
 * A command that commits: `git`, then global options such as `-C <dir>`, then
 * `commit` as a word, in one simple command. `git commit-tree` does not match.
 */
const COMMIT = /\bgit[ \t](?:[^;&|\n]*[ \t])?commit(?![\w-])/;
/** The files of the last commit; --root also answers for the first commit. */
const LAST_COMMIT = [
  "diff-tree",
  "--no-commit-id",
  "--name-only",
  "-r",
  "--root",
];

/** Whether a command commits: the sweep then also covers the last commit. */
const commits = (call: Call) =>
  !call.filePath && COMMIT.test(call.command ?? "");

/** Whether AGENT_HOOKS_DISABLE names `hook`. */
const sessionOff = (hook: string, settings: Settings) =>
  (settings.hooksOff ?? "").split(/[\s,]+/).includes(hook);

/**
 * A file under /tmp, /var/tmp, or TMPDIR is a scratch file, not project code.
 * macOS resolves /tmp to /private/tmp, so both sides drop that prefix.
 */
function throwaway(file: string, settings: Settings): boolean {
  const tmpdir = (settings.tmpdir || "/nonexistent").replace(/^\/private/, "");
  const plain = file.replace(/^\/private/, "");
  return (
    plain.startsWith("/tmp/") ||
    plain.startsWith("/var/tmp/") ||
    plain.startsWith(tmpdir)
  );
}

export const parent = (path: string) =>
  path.slice(0, path.lastIndexOf("/")) || "/";

async function toplevel(dir: string, io: Io): Promise<string | undefined> {
  const ran = await io.run(["git", "rev-parse", "--show-toplevel"], {
    cwd: dir,
  });
  return ran?.exitCode === 0 ? ran.stdout.trim() : undefined;
}

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
 * Whether format-oxfmt, and not format-prettier, formats the files of a
 * call: git config sets agent-hook.format-oxfmt.enabled to true, in the
 * repository or globally, and AGENT_HOOKS_DISABLE does not name format-oxfmt.
 * shortcut: one answer for each call, from the session folder, so that the
 * hook that does not format starts one git run and no sweep. A file in
 * another repository follows the session folder. To choose for each file,
 * both hooks must sweep each Bash call.
 */
async function oxfmtFormats(
  call: Call,
  io: Io,
  settings: Settings,
): Promise<boolean> {
  if (sessionOff("format-oxfmt", settings)) return false;
  return (
    (await gitBool(call.cwd, "agent-hook.format-oxfmt.enabled", io)) === "true"
  );
}

/**
 * The Markdown files a Bash call may have changed: the paths the command
 * names, and the files that git reports as changed or untracked in each
 * repository the command touches. README "Bash (markdown sweep)".
 */
async function sweep(call: Call, io: Io): Promise<string[]> {
  const command = call.command ?? "";
  // Named paths come first: git hides an ignored file from the sweep, and a
  // commit in the same call hides a tracked one.
  const found = [...command.matchAll(NAMED)].map(([path]) =>
    path.startsWith("/") ? path : `${call.cwd}/${path}`,
  );
  // The roots: the cwd and each absolute path in the command, because a `cd`
  // in the command never moves the cwd of the hook. shortcut: absolute paths
  // only, because a relative one is ambiguous after a cd.
  const roots = new Set<string>();
  const paths = new Set([
    call.cwd,
    ...[...command.matchAll(ABSOLUTE)].map(([path]) => path),
  ]);
  for (const path of paths) {
    const dir = (await io.stat(path))?.kind === "dir" ? path : parent(path);
    const root = await toplevel(dir, io);
    if (root) roots.add(root);
  }
  // A repository inside a repository lists as one folder entry, so each such
  // entry joins the roots as a root of its own. for...of over a Set visits the
  // roots that join while it runs.
  const lists = [
    ["diff", "--name-only", "-z", "--diff-filter=d", "HEAD"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ];
  // A command that writes and commits leaves a clean tree, so the sweep also
  // takes the files of the last commit. README "Write and commit in one command".
  if (commits(call))
    lists.push([...LAST_COMMIT, "-z", "--diff-filter=d", "HEAD"]);
  for (const root of roots) {
    const changed = new Set<string>();
    for (const args of lists) {
      // A repository with no commits has no HEAD, so the diff fails and the
      // untracked files still count.
      const ran = await io.run(["git", ...args], { cwd: root });
      if (ran?.exitCode === 0)
        for (const path of ran.stdout.split("\0")) if (path) changed.add(path);
    }
    for (const path of changed) {
      const full = `${root}/${path}`;
      if ((await io.stat(full))?.kind !== "dir") found.push(full);
      else {
        const nested = await toplevel(full, io);
        if (nested) roots.add(nested);
      }
    }
  }
  return found;
}

/**
 * The files to format, each once. A Write or Edit: the file it names, by the
 * extensions of the formatter. A Bash call: the Markdown files of the sweep.
 * A file whose repository sets agent-hook.<hook>.enabled to false, as
 * /toggle-hook --repo does, stays as it is.
 */
async function targets(
  call: Call,
  io: Io,
  settings: Settings,
  formatter: Formatter,
): Promise<string[]> {
  const named = call.filePaths ?? (call.filePath ? [call.filePath] : undefined);
  const candidates = named ?? (await sweep(call, io));
  const extensions = named ? formatter.edited : MARKDOWN;
  const key = `agent-hook.${formatter.hook}.enabled`;
  const kept: string[] = [];
  // One git run for each folder: a commit can name many files.
  const asked = new Map<string, Promise<string>>();
  for (const file of new Set(candidates)) {
    if (
      !extensions.test(file) ||
      throwaway(file, settings) ||
      (await io.stat(file))?.kind !== "file"
    )
      continue;
    const dir = parent(file);
    if (!asked.has(dir)) asked.set(dir, gitBool(dir, key, io));
    if ((await asked.get(dir)) !== "false") kept.push(file);
  }
  return kept;
}

/**
 * Formats the files a call changed, when this formatter is the one that
 * formats the call. Returns the amend hint for the model when the call
 * committed a Markdown file that the formatter then changed, else undefined.
 * README "Write and commit in one command".
 */
export async function format(
  call: Call,
  io: Io,
  settings: Settings,
  formatter: Formatter,
): Promise<string | undefined> {
  if (sessionOff(formatter.hook, settings)) return undefined;
  const oxfmt = await oxfmtFormats(call, io, settings);
  if (oxfmt !== (formatter.hook === "format-oxfmt")) return undefined;
  const files = await targets(call, io, settings, formatter);
  if (!files.length) return undefined;
  // The hint names only the files that the formatter itself changed, so keep
  // the text from before the run. A commit sweep holds only Markdown.
  const watched = commits(call) ? files : [];
  const before = await Promise.all(watched.map((file) => io.read(file)));
  let started = false;
  for (const argv of await formatter.argvs(files, io))
    if (await io.run(argv, { cwd: call.cwd, timeoutMs: 20_000 }))
      started = true;
  if (!started) return undefined;
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
  return `${formatter.name} reformatted markdown after your commit, so the commit holds the unformatted version and the working tree is now dirty: ${dirty.join(" ")}. Fold the formatting into that commit (amend, or a fixup commit if it is already pushed).`;
}
