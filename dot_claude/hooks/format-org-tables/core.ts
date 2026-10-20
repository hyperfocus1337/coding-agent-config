/**
 * The format-org-tables logic: finds the Org files a tool call changed and
 * aligns their tables with one batch Emacs run. Prettier has no Org parser,
 * so format-prettier skips .org. Never blocks: a missing Emacs or a
 * failed run leaves the files as they are. The adapters pass in the file and
 * process functions, because a mod reaches them only through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp), omp.ts
 * (omp only), command.ts (Codex, and the format-staged-files pre-commit hook).
 * Design notes: README.md.
 */

export interface Io {
  /** The kind of a path and its mtime; undefined if missing. */
  stat(
    path: string,
  ): Promise<{ kind: "file" | "dir" | "other"; mtimeMs: number } | undefined>;
  /** The text of a file; undefined if it cannot be read. */
  read(path: string): Promise<string | undefined>;
  /** The stdout of a program; undefined when it cannot start. */
  run(
    argv: string[],
    options: { cwd: string; env?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ stdout: string } | undefined>;
}

export interface Settings {
  /** TMPDIR: files under it are throwaway and not aligned. */
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

/** An Org path that a command names. */
const NAMED = /[^\s:;|&"'`()<>=]+\.org\b/g;

/**
 * Aligns each table in the files of ORG_TABLE_FILES, one per line. Alignment
 * only: a #+TBLFM formula is not evaluated. org-link-descriptive nil counts a
 * link at its raw width, so the table is straight in a diff too. README
 * "Alignment only" and "Links count at their raw width".
 */
const ELISP = `
(progn
  (setq make-backup-files nil create-lockfiles nil org-link-descriptive nil)
  (dolist (file (split-string (getenv "ORG_TABLE_FILES") "\\n" t))
    (with-current-buffer (find-file-noselect file)
      (org-mode)
      (goto-char (point-min))
      (while (re-search-forward "^[ \\t]*|" nil t)
        (when (org-at-table-p)
          (org-table-align)
          (goto-char (org-table-end))))
      (save-buffer))))`;

/**
 * A file under /tmp, /var/tmp, or TMPDIR is a scratch file, not project
 * prose. macOS resolves /tmp to /private/tmp, so both sides drop that prefix.
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

/**
 * The files to align, each once. A Write or Edit: the file it names. A Bash
 * call: the .org paths its command names that it just wrote, by an mtime of
 * at most 120 s, so a file the command only read stays as it is. shortcut: a
 * command that writes early and then runs for minutes falls outside the
 * window. The upgrade is a start time stamped before the call. Only a file
 * with a line that starts with `|` counts, which keeps Emacs out of the
 * common case. README "Files without tables".
 */
async function targets(
  call: Call,
  io: Io,
  settings: Settings,
): Promise<string[]> {
  const named = call.filePath
    ? [call.filePath]
    : [...(call.command ?? "").matchAll(NAMED)].map(([path]) =>
        path.startsWith("/") ? path : `${call.cwd}/${path}`,
      );
  const kept: string[] = [];
  for (const file of new Set(named)) {
    if (!file.endsWith(".org") || throwaway(file, settings)) continue;
    const stat = await io.stat(file);
    if (stat?.kind !== "file") continue;
    if (!call.filePath && Date.now() - stat.mtimeMs > 120_000) continue;
    if (/^[ \t]*\|/m.test((await io.read(file)) ?? "")) kept.push(file);
  }
  return kept;
}

/**
 * Aligns the tables in the files a call changed. Returns the amend hint for
 * the model when the call committed a file that Emacs then changed, else
 * undefined. README "Write and commit in one command".
 */
export async function align(
  call: Call,
  io: Io,
  settings: Settings,
): Promise<string | undefined> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes("format-org-tables"))
    return undefined;
  const files = await targets(call, io, settings);
  if (!files.length) return undefined;
  // Only a command that commits gets the hint, and the hint names only the
  // files that Emacs itself changed, so keep the text from before the run.
  const watched =
    !call.filePath && call.command?.includes("git commit") ? files : [];
  const before = await Promise.all(watched.map((file) => io.read(file)));
  // One Emacs for all files: the 1.4 s is the start of Emacs. --no-init-file
  // keeps the user's init out. README "One Emacs run for every file".
  const ran = await io.run(
    ["emacs", "--batch", "--no-init-file", "--eval", ELISP],
    {
      cwd: call.cwd,
      env: { ORG_TABLE_FILES: files.join("\n") },
      timeoutMs: 10_000,
    },
  );
  if (!ran) return undefined;
  const dirty: string[] = [];
  for (const [i, file] of watched.entries()) {
    if ((await io.read(file)) === before[i]) continue;
    // Only a file that the last commit holds needs an amend. diff-tree --root
    // also answers for the first commit of a repository.
    const held = await io.run(
      [
        "git",
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        "--root",
        "HEAD",
        "--",
        file,
      ],
      { cwd: file.slice(0, file.lastIndexOf("/")) || "/" },
    );
    if (held?.stdout.trim()) dirty.push(file);
  }
  if (!dirty.length) return undefined;
  return `Emacs realigned Org tables after your commit, so the commit holds the unaligned version and the working tree is now dirty: ${dirty.join(" ")}. Fold the alignment into that commit (amend, or a fixup commit if it is already pushed).`;
}
