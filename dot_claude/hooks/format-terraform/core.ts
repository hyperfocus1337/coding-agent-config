/**
 * The format-terraform logic: finds the Terraform files a tool call changed
 * and formats each one with `terraform fmt`. Prettier has no Terraform
 * parser, so format-prettier skips .tf. Never blocks: a missing terraform or
 * a file that does not parse stays as it is. The adapters pass in the file
 * and process functions, because a mod reaches them only through `$`.
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

/**
 * A command that commits: `git`, then global options such as `-C <dir>`, then
 * `commit` as a word, in one simple command. `git commit-tree` does not match.
 */
const COMMIT = /\bgit[ \t](?:[^;&|\n]*[ \t])?commit(?![\w-])/;

/** The extensions terraform fmt formats here. */
const TERRAFORM = /\.(tf|tfvars)$/;
/** A Terraform path that a command names. */
const NAMED = /[^\s:;|&"'`()<>=]+\.(?:tfvars|tf)\b/g;

const plain = (path: string) => path.replace(/^\/private/, "");

/**
 * A file under /tmp, /var/tmp, or TMPDIR is a scratch file, not project
 * code. macOS resolves /tmp to /private/tmp, so both sides drop that prefix.
 */
function throwaway(file: string, { tmpdir }: Settings): boolean {
  const dirs = ["/tmp/", "/var/tmp/", ...(tmpdir ? [plain(tmpdir)] : [])];
  return dirs.some((dir) => plain(file).startsWith(dir));
}

/**
 * The files to format, each once. A Write or Edit: the file it names. A Bash
 * call: the Terraform paths its command names that it just wrote, by an
 * mtime of at most 120 s, so a file the command only read stays as it is.
 * shortcut: a command that writes early and then runs for minutes falls
 * outside the window. The upgrade is a start time stamped before the call.
 */
async function targets(
  call: Call,
  io: Io,
  settings: Settings,
): Promise<string[]> {
  const paths = call.filePath
    ? [call.filePath]
    : [...(call.command ?? "").matchAll(NAMED)].map(([named]) =>
        named.startsWith("/") ? named : `${call.cwd}/${named}`,
      );
  const kept: string[] = [];
  for (const file of new Set(paths)) {
    if (!TERRAFORM.test(file) || throwaway(file, settings)) continue;
    const stat = await io.stat(file);
    if (
      stat?.kind === "file" &&
      (call.filePath || Date.now() - stat.mtimeMs <= 120_000)
    )
      kept.push(file);
  }
  return kept;
}

/**
 * Formats the Terraform files a call changed. Returns the amend hint for the
 * model when the call committed a file that terraform fmt then changed, else
 * undefined. README "Write and commit in one command".
 */
export async function format(
  call: Call,
  io: Io,
  settings: Settings,
): Promise<string | undefined> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes("format-terraform"))
    return undefined;
  // A command that commits: the hint then checks the last commit.
  const commits = !call.filePath && COMMIT.test(call.command ?? "");
  const dirty: string[] = [];
  for (const file of await targets(call, io, settings)) {
    // One run for each file: a file that does not parse makes terraform fmt
    // exit 2 and skip the files after it. A run takes about 15 ms. stdout
    // names the file only when the run changed it.
    const dir = file.slice(0, file.lastIndexOf("/")) || "/";
    const ran = await io.run(["terraform", "fmt", "-no-color", file], {
      cwd: dir,
      timeoutMs: 10_000,
    });
    if (!commits || ran?.exitCode !== 0 || !ran.stdout.trim()) continue;
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
      { cwd: dir },
    );
    if (held?.stdout.trim()) dirty.push(file);
  }
  if (!dirty.length) return undefined;
  return `terraform fmt reformatted files after your commit, so the commit holds the unformatted version and the working tree is now dirty: ${dirty.join(" ")}. Fold the formatting into that commit (amend, or a fixup commit if it is already pushed).`;
}
