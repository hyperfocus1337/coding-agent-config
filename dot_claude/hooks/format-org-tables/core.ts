/**
 * The format-org-tables logic: finds the Org files a tool call changed and
 * aligns their tables with one batch Emacs run. oxfmt has no Org parser, so
 * format-oxfmt skips .org. Never blocks: a missing Emacs or a
 * failed run leaves the files as they are. The adapters pass in the file and
 * process functions, because a mod reaches them only through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp), omp.ts
 * (omp only), command.ts (Codex, and the format-staged-files pre-commit hook).
 * Design notes: docs/implementation.md.
 */

import { COMMIT, LAST_COMMIT, shellFiles } from "./sweep.ts";

export interface Io {
  /** The kind of a path and its mtime; undefined if missing. */
  stat(path: string): Promise<{ kind: "file" | "dir" | "other"; mtimeMs: number } | undefined>;
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
  // The slash keeps a sibling such as $TMPDIR-project out.
  const tmpdir = (settings.tmpdir || "/nonexistent").replace(/^\/private/, "").replace(/\/$/, "");
  const plain = file.replace(/^\/private/, "");
  return (
    plain.startsWith("/tmp/") || plain.startsWith("/var/tmp/") || plain.startsWith(`${tmpdir}/`)
  );
}

/**
 * Whether the git config of the repository that holds `dir` sets
 * agent-hook.format-org-tables.enabled to false, as /toggle-hook --repo does.
 * Outside git, a missing key, or a value that is not a boolean: false.
 */
async function repoOff(dir: string, io: Io): Promise<boolean> {
  const key = "agent-hook.format-org-tables.enabled";
  const ran = await io.run(["git", "config", "--type=bool", "--get", key], {
    cwd: dir,
  });
  return ran?.stdout.trim() === "false";
}

/**
 * The files to align, each once. A Write or Edit: the file it names. A Bash
 * call: the .org files it changed, from sweep.ts, so a file the command only
 * read stays as it is. Only a file with a line that starts with `|` counts,
 * which keeps Emacs out of the common case. README "Files without tables". A
 * file whose repository turns off the hook stays as it is.
 */
async function targets(call: Call, io: Io, settings: Settings): Promise<string[]> {
  const { command, cwd, since } = call;
  const named =
    call.filePaths ??
    (call.filePath ? [call.filePath] : undefined) ??
    (command === undefined ? [] : await shellFiles({ command, cwd, since }, ["org"], io));
  const kept: string[] = [];
  // One git run for each folder: a commit can name many files.
  const asked = new Map<string, Promise<boolean>>();
  for (const file of new Set(named)) {
    if (!file.endsWith(".org") || throwaway(file, settings)) continue;
    if ((await io.stat(file))?.kind !== "file") continue;
    if (!/^[ \t]*\|/m.test((await io.read(file)) ?? "")) continue;
    const dir = file.slice(0, file.lastIndexOf("/")) || "/";
    if (!asked.has(dir)) asked.set(dir, repoOff(dir, io));
    if (!(await asked.get(dir))) kept.push(file);
  }
  return kept;
}

/**
 * Aligns the tables in the files a call changed. Returns the amend hint for
 * the model when the call committed a file that Emacs then changed, else
 * undefined. README "Write and commit in one command".
 */
export async function align(call: Call, io: Io, settings: Settings): Promise<string | undefined> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes("format-org-tables")) return undefined;
  const files = await targets(call, io, settings);
  if (!files.length) return undefined;
  // Only a command that commits gets the hint, and the hint names only the
  // files that Emacs itself changed, so keep the text from before the run.
  const watched = !call.filePath && COMMIT.test(call.command ?? "") ? files : [];
  const before = await Promise.all(watched.map((file) => io.read(file)));
  // One Emacs for all files: the 1.4 s is the start of Emacs. --no-init-file
  // keeps the user's init out. README "One Emacs run for every file".
  const ran = await io.run(["emacs", "--batch", "--no-init-file", "--eval", ELISP], {
    cwd: call.cwd,
    env: { ORG_TABLE_FILES: files.join("\n") },
    timeoutMs: 10_000,
  });
  if (!ran) return undefined;
  const dirty: string[] = [];
  for (const [i, file] of watched.entries()) {
    if ((await io.read(file)) === before[i]) continue;
    // Only a file that the last commit holds needs an amend.
    const held = await io.run(["git", ...LAST_COMMIT, "HEAD", "--", file], {
      cwd: file.slice(0, file.lastIndexOf("/")) || "/",
    });
    if (held?.stdout.trim()) dirty.push(file);
  }
  if (!dirty.length) return undefined;
  return `Emacs realigned Org tables after your commit, so the commit holds the unaligned version and the working tree is now dirty: ${dirty.join(" ")}. Fold the alignment into that commit (amend, or a fixup commit if it is already pushed).`;
}
