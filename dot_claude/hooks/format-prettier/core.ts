/**
 * The format-prettier logic: finds the files a tool call changed and
 * formats them with one Prettier run. Never blocks: a missing Prettier or a
 * parse error leaves the files as they are. The adapters pass in the file and
 * process functions, because a mod reaches them only through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp),
 * command.ts (Codex, and the format-staged-files pre-commit hook).
 * Design notes: README.md.
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
  /** CLAUDE_HOOKS_DISABLE: the hooks /toggle-hook turned off. */
  hooksOff?: string;
}

/** The tool call: a Write or Edit names a file, a Bash call a command. */
export interface Call {
  filePath?: string;
  command?: string;
  cwd: string;
}

/** The extensions Prettier formats after a Write or an Edit. README "Supported extensions". */
const EDITED =
  /\.(md|markdown|js|jsx|ts|tsx|mts|cts|mjs|cjs|json|css|scss|html|yml|yaml)$/;
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

const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

async function toplevel(dir: string, io: Io): Promise<string | undefined> {
  const ran = await io.run(["git", "rev-parse", "--show-toplevel"], {
    cwd: dir,
  });
  return ran?.exitCode === 0 ? ran.stdout.trim() : undefined;
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
 * extensions Prettier formats. A Bash call: the Markdown files of the sweep.
 */
async function targets(
  call: Call,
  io: Io,
  settings: Settings,
): Promise<string[]> {
  const candidates = call.filePath ? [call.filePath] : await sweep(call, io);
  const extensions = call.filePath ? EDITED : MARKDOWN;
  const kept: string[] = [];
  for (const file of new Set(candidates))
    if (
      extensions.test(file) &&
      !throwaway(file, settings) &&
      (await io.stat(file))?.kind === "file"
    )
      kept.push(file);
  return kept;
}

/**
 * Formats the files a call changed. Returns the amend hint for the model when
 * the call committed a Markdown file that Prettier then changed, else
 * undefined. README "Write and commit in one command".
 */
export async function format(
  call: Call,
  io: Io,
  settings: Settings,
): Promise<string | undefined> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes("format-prettier"))
    return undefined;
  const files = await targets(call, io, settings);
  if (!files.length) return undefined;
  // The hint names only the files that Prettier itself changed, so keep the
  // text from before the run. A commit sweep holds only Markdown.
  const watched = commits(call) ? files : [];
  const before = await Promise.all(watched.map((file) => io.read(file)));
  // --prose-wrap preserve keeps one sentence per line. --ignore-path drops
  // .gitignore from the ignore files of Prettier, and keeps .prettierignore.
  // README "Prose wrapping" and "Prettier's own ignore rules".
  const ran = await io.run(
    [
      "prettier",
      "--write",
      "--prose-wrap",
      "preserve",
      "--ignore-path",
      ".prettierignore",
      ...files,
    ],
    { cwd: call.cwd, timeoutMs: 20_000 },
  );
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
  return `Prettier reformatted markdown after your commit, so the commit holds the unformatted version and the working tree is now dirty: ${dirty.join(" ")}. Fold the formatting into that commit (amend, or a fixup commit if it is already pushed).`;
}
