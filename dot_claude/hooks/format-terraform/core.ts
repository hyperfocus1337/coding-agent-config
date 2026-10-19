/**
 * The format-terraform logic: finds the Terraform files a tool call changed
 * and formats each one with `terraform fmt`. Prettier has no Terraform
 * parser, so format-prettier skips .tf. Never blocks: a missing terraform or
 * a file that does not parse stays as it is. The adapters pass in the file
 * and process functions, because a mod reaches them only through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp),
 * command.ts (Codex, and the format-staged-files pre-commit hook).
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
}

/** The tool call: a Write or Edit names a file, a Bash call a command. */
export interface Call {
  filePath?: string;
  command?: string;
  cwd: string;
}

/** The extensions terraform fmt formats here. */
const TERRAFORM = /\.(tf|tfvars)$/;
/** A Terraform path that a command names. */
const NAMED = /[^\s:;|&"'`()<>=]+\.(?:tfvars|tf)\b/g;

/** Whether a command commits: the hint then checks the last commit. */
const commits = (call: Call) =>
  !call.filePath && (call.command ?? "").includes("git commit");

/**
 * A file under /tmp, /var/tmp, or TMPDIR is a scratch file, not project
 * code. macOS resolves /tmp to /private/tmp, so both sides drop that prefix.
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
 * The files to format, each once. A Write or Edit: the file it names. A Bash
 * call: the Terraform paths its command names that it just wrote, by an
 * mtime of at most 120 s, so a file the command only read stays as it is.
 * shortcut: a command that writes early and then runs for minutes falls
 * outside the window. The upgrade is a start time stamped before the call.
 */
export async function targets(
  call: Call,
  io: Io,
  settings: Settings,
  now = Date.now(),
): Promise<string[]> {
  const candidates: string[] = [];
  if (call.filePath) candidates.push(call.filePath);
  else
    for (const [named] of (call.command ?? "").matchAll(NAMED)) {
      const path = named.startsWith("/") ? named : `${call.cwd}/${named}`;
      const stat = await io.stat(path);
      if (stat?.kind === "file" && now - stat.mtimeMs <= 120_000)
        candidates.push(path);
    }
  const kept: string[] = [];
  for (const file of candidates)
    if (
      TERRAFORM.test(file) &&
      !throwaway(file, settings) &&
      !kept.includes(file) &&
      (await io.stat(file))?.kind === "file"
    )
      kept.push(file);
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
    if (!commits(call) || ran?.exitCode !== 0 || !ran.stdout.trim()) continue;
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
