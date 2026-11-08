/**
 * The files that a shell call changed, for ./core.ts.
 *
 * The candidates are the paths that the command names, and the changed and
 * untracked files of each repository that the call touched. A candidate counts
 * when it changed after the call started. track-session-changes finds the same
 * files with a snapshot, but it must log after the format hooks ran, so that
 * its log holds the formatted text. docs/hooks/decisions.md "The format hooks
 * find the files of a shell call themselves".
 */

export interface SweepIo {
  /** The kind of a path and its mtime; undefined if missing. */
  stat(path: string): Promise<{ kind: "file" | "dir" | "other"; mtimeMs: number } | undefined>;
  /** The stdout of a program; undefined when it cannot start. */
  run(argv: string[], options: { cwd: string }): Promise<{ stdout: string } | undefined>;
}

/**
 * A shell call: its command, the session folder, and the time in ms before it
 * ran. A Codex hook runs only after the call, so it has no start time.
 */
export interface Shell {
  command: string;
  cwd: string;
  since?: number;
}

/**
 * A command that commits: `git`, then global options such as `-C <dir>`, then
 * `commit` as a word, in one simple command. `git commit-tree` does not match.
 */
export const COMMIT = /\bgit[ \t](?:[^;&|\n]*[ \t])?commit(?![\w-])/;

/** The files of the last commit; --root also answers for the first commit. */
export const LAST_COMMIT = ["diff-tree", "--no-commit-id", "--name-only", "-r", "--root"];

/**
 * An absolute path in a command: a root for the sweep. The `/` starts a word,
 * so the end of a relative path such as `docs/a.md` does not match.
 */
const ABSOLUTE = /(?<![^\s"'`=(;|&<>])\/[^\s:;|&"'`()<>]+/g;

/** Without a start time, a file counts when it changed in this window. */
const WINDOW_MS = 120_000;

const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

async function toplevel(dir: string, io: SweepIo): Promise<string | undefined> {
  // git prints the error on stderr, so a folder outside git gives no stdout.
  return (
    (await io.run(["git", "rev-parse", "--show-toplevel"], { cwd: dir }))?.stdout.trim() ||
    undefined
  );
}

/**
 * The files with one of `extensions` that the call changed, each once. With
 * the start time, a file counts when its mtime is at or after the start,
 * rounded down to the second, so that a file system with 1 s mtimes does not
 * miss a write. Without it, the file must have changed in the last 120 s.
 * shortcut: a file that another program changed during the call counts too.
 * The upgrade is the snapshot of track-session-changes, which the format hooks
 * cannot wait for.
 */
export async function shellFiles(
  shell: Shell,
  extensions: string[],
  io: SweepIo,
  now = Date.now(),
): Promise<string[]> {
  const pattern = extensions.join("|");
  const named = new RegExp(`[^\\s:;|&"'\`()<>=]+\\.(?:${pattern})\\b`, "g");
  const wanted = new RegExp(`\\.(?:${pattern})$`);
  // Named paths count also when git cannot see them: a file written and
  // ignored in the same call is already ignored when the hook runs.
  const found = [...shell.command.matchAll(named)].map(([path]) =>
    path.startsWith("/") ? path : `${shell.cwd}/${path}`,
  );
  // The roots: the cwd and each absolute path in the command, because a `cd`
  // in the command never moves the cwd of the hook. shortcut: absolute paths
  // only, because a relative one is ambiguous after a cd.
  const roots = new Set<string>();
  const paths = new Set([
    shell.cwd,
    ...[...shell.command.matchAll(ABSOLUTE)].map(([path]) => path),
  ]);
  for (const path of paths) {
    const dir = (await io.stat(path))?.kind === "dir" ? path : parent(path);
    const root = await toplevel(dir, io);
    if (root) roots.add(root);
  }
  const lists = [
    ["diff", "--name-only", "-z", "--diff-filter=d", "HEAD"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ];
  // A command that writes and commits leaves a clean tree, so the sweep also
  // takes the files of the last commit.
  if (COMMIT.test(shell.command)) lists.push([...LAST_COMMIT, "-z", "--diff-filter=d", "HEAD"]);
  // for...of over a Set visits the roots that join while it runs.
  for (const root of roots)
    for (const args of lists) {
      // A repository with no commits has no HEAD, so the diff prints nothing
      // and the untracked files still count.
      const ran = await io.run(["git", ...args], { cwd: root });
      for (const path of ran?.stdout.split("\0") ?? []) {
        if (!path) continue;
        const full = `${root}/${path.replace(/\/$/, "")}`;
        if (wanted.test(path)) found.push(full);
        // A repository inside the repository lists as one entry and joins the
        // roots: an untracked one with a trailing slash, a submodule as a
        // changed path that is a folder. Only a changed path needs the stat.
        else if (
          path.endsWith("/") ||
          (args[0] !== "ls-files" && (await io.stat(full))?.kind === "dir")
        ) {
          const nested = await toplevel(full, io);
          if (nested) roots.add(nested);
        }
      }
    }
  const start = shell.since === undefined ? now - WINDOW_MS : Math.floor(shell.since / 1000) * 1000;
  const kept: string[] = [];
  for (const file of new Set(found)) {
    if (!wanted.test(file)) continue;
    const stat = await io.stat(file);
    if (stat?.kind === "file" && stat.mtimeMs >= start) kept.push(file);
  }
  return kept;
}
