/**
 * The lint-prose logic: lints the prose in the file a Write or Edit changed,
 * through check.sh and Vale. Only the alerts in paragraphs that git reports as
 * changed count, and each alert blocks once per session. Not on Bash: a
 * command names files it only reads, and a read must not block. The adapters
 * pass in the file and process functions, because a mod reaches them only
 * through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts and omp.ts (pi and
 * omp), command.ts (Codex). Design notes and the rules: docs/implementation.md.
 */

export interface Io {
  /** Whether a path is a regular file. */
  isFile(path: string): Promise<boolean>;
  /** The text of a file; undefined if it cannot be read. */
  read(path: string): Promise<string | undefined>;
  /** Writes the whole text of a file. */
  write(path: string, text: string): Promise<void>;
  /** The exit code, stdout, and stderr; undefined when the program cannot start. */
  run(
    argv: string[],
    cwd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string } | undefined>;
}

export interface Settings {
  /** CLAUDE_LINT_DISABLE: "prose" or "all" turns the hook off. */
  disable?: string;
  /** TMPDIR: files under it are throwaway, and the session record goes in it. */
  tmpdir?: string;
  /** The Vale config and scripts/check.sh: ~/.config/vale, or LINT_PROSE_VALE_DIR. */
  valeDir: string;
  /** CLAUDE_HOOKS_DISABLE: the hooks /toggle-hook turned off. */
  hooksOff?: string;
}

/** What to say: `block` goes to the model, `notice` to the user only. */
export interface Result {
  block?: string;
  notice?: string;
}

const PROSE = /\.(md|markdown|org|html?|txt)$/;
const BLANK = /^\s*$/;

const dirname = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

/**
 * A file under /tmp, /var/tmp, or TMPDIR is scratch prose, not project prose.
 * macOS resolves /tmp to /private/tmp, so both sides drop that prefix.
 */
function throwaway(file: string, tmpdir: string | undefined): boolean {
  const plain = (path: string) => path.replace(/^\/private/, "");
  return ["/tmp/", "/var/tmp/", tmpdir].some(
    (dir) => dir && plain(file).startsWith(plain(dir)),
  );
}

/**
 * The line numbers of a file that differ from HEAD. Undefined when there is no
 * base to compare to: outside git, an untracked file, or a first commit. Then
 * every line is new. docs/implementation.md "Only the changed paragraphs".
 */
async function changedLines(
  file: string,
  io: Io,
): Promise<Set<number> | undefined> {
  const dir = dirname(file);
  const git = (...args: string[]) => io.run(["git", ...args], dir);
  if ((await git("ls-files", "--error-unmatch", "--", file))?.exitCode !== 0)
    return undefined;
  // Before the first commit there is no HEAD, and the diff fails.
  const diff = await git("diff", "-U0", "HEAD", "--", file);
  if (diff?.exitCode !== 0) return undefined;
  const lines = new Set<number>();
  // A hunk header is @@ -a,b +start,count @@. A count of 0 is a deletion
  // after line start, and that line still marks its paragraph as changed.
  for (const [, start, count = "1"] of diff.stdout.matchAll(
    /^@@ \S+ \+(\d+)(?:,(\d+))?/gm,
  )) {
    for (let i = 0; i < Math.max(Number(count), 1); i++)
      lines.add(Number(start) + i);
  }
  return lines;
}

/**
 * The paragraph that starts at a 1-based line: its lines up to the next blank
 * line.
 */
function paragraph(lines: string[], start: number): string[] {
  const end = lines.findIndex((line, i) => i >= start && BLANK.test(line));
  return lines.slice(start - 1, end < 0 ? undefined : end);
}

/** Lints one file. The session id keys the once-per-session record. */
export async function check(
  file: string | undefined,
  session: string | undefined,
  io: Io,
  settings: Settings,
): Promise<Result> {
  const names = (list = "") => list.split(/[\s,]+/);
  if (
    names(settings.hooksOff).includes("lint-prose") ||
    names(settings.disable).some((name) => name === "all" || name === "prose")
  )
    return {};
  if (
    !file ||
    !PROSE.test(file) ||
    throwaway(file, settings.tmpdir) ||
    !(await io.isFile(file))
  )
    return {};
  const dir = dirname(file);
  // Run it, not a PATH lookup: a mise shim with no version set for this
  // directory is on PATH but fails, and its error would block as an alert.
  if ((await io.run(["vale", "--version"], dir))?.exitCode !== 0) return {};
  // Vale on PATH but no config: chezmoi did not deploy ~/.config/vale here.
  const script = `${settings.valeDir}/scripts/check.sh`;
  if (!(await io.isFile(script)))
    return {
      notice: `lint-prose: ${script} is missing, so the prose was not checked. Run \`just chezmoi\` to deploy the Vale config.\n`,
    };

  // check.sh exits 1 on alerts and 2 when Vale fails, such as on a broken
  // rule. A failure is not the prose's fault, so it goes to the user and does
  // not block. docs/implementation.md "Why it blocks".
  const ran = await io.run(["bash", script, file], dir);
  if (!ran || ran.exitCode === 0) return {};
  const output = (ran.stdout + ran.stderr).replace(/\n+$/, "");
  if (ran.exitCode !== 1)
    return {
      notice: `lint-prose: Vale failed, so the prose was not checked:\n${output}\n`,
    };

  const lines = ((await io.read(file)) ?? "").replace(/\n$/, "").split("\n");
  const prefix = `${file}:`;
  let alerts = output.split("\n").filter(Boolean);
  // An alert names the first line of its paragraph, and the paragraph runs to
  // the next blank line, so a changed line anywhere in that span keeps it.
  // shortcut: a tight list is one span, so a change to one item keeps the
  // alerts of every long item in that list. The upgrade is item boundaries.
  const changed = await changedLines(file, io);
  if (changed)
    alerts = alerts.filter((alert) => {
      if (!alert.startsWith(prefix)) return false;
      const start = Number(alert.slice(prefix.length).split(":")[0]);
      return paragraph(lines, start).some((_, i) => changed.has(start + i));
    });

  // An alert is a repeat when the record holds its file, rule, and paragraph
  // text. The text, not the line: an edit above the paragraph moves it, and an
  // edit that leaves it too long makes it new again. No valid session id, no
  // record: every alert blocks. docs/implementation.md "Once per session".
  const record =
    session && /^[A-Za-z0-9_-]+$/.test(session)
      ? `${settings.tmpdir || "/tmp"}/lint-prose-${session}`
      : undefined;
  const before = record ? ((await io.read(record)) ?? "") : "";
  const seen = new Set(before.split("\n"));
  const added: string[] = [];
  const report: string[] = [];
  const repeats: string[] = [];
  for (const alert of alerts) {
    const [line = "", , rule = ""] = alert
      .slice(alert.startsWith(prefix) ? prefix.length : 0)
      .split(":");
    const key = JSON.stringify([
      file,
      rule,
      paragraph(lines, Number(line)).join("\n"),
    ]);
    if (seen.has(key)) repeats.push(alert);
    else {
      report.push(alert);
      seen.add(key);
      added.push(key);
    }
  }
  // shortcut: read and write back, because the mod's $.fs has no append. Two
  // calls at once in one session can drop a key, and that alert blocks once
  // more. The upgrade is an append in Io.
  if (record && added.length)
    await io.write(record, `${before}${added.join("\n")}\n`);
  if (report.length) return { block: `${report.join("\n")}\n` };
  if (repeats.length)
    return {
      notice: `lint-prose: blocked on before in this session, so not again:\n${repeats.join("\n")}\n`,
    };
  return {};
}
