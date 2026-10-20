/**
 * The block-secret-commits logic: before a `git commit`, scans the newly added
 * binary files and the staged content with betterleaks. The adapters pass in
 * the file and process functions. The reasons for each step are in
 * docs/implementation.md.
 *
 * Adapters: command.ts (Claude Code and Codex command hook), pi.ts (pi and
 * omp). There is no mod: the mod API cannot copy a binary file.
 */

interface Ran {
  /** -1 when the program was stopped by a signal. */
  exitCode: number;
  stdout: string;
  /** The time cap stopped the program. */
  timedOut: boolean;
}

/** Relative paths resolve against the repo root, where each program runs. */
export interface Io {
  /** undefined when the program cannot start (not installed). */
  run(argv: string[], timeoutMs?: number): Promise<Ran | undefined>;
  /** The text of a file; undefined when it is missing. */
  read(path: string): Promise<string | undefined>;
  /** The size of a readable file; undefined when it is missing or unreadable. */
  size(path: string): Promise<number | undefined>;
  /** A new empty temporary folder; undefined when it cannot be made. */
  tempDir(): Promise<string | undefined>;
  /** Whether the copy succeeded. */
  copy(from: string, to: string): Promise<boolean>;
  remove(path: string): Promise<void>;
}

export interface Settings {
  /** The repo root: CLAUDE_PROJECT_DIR, or the working folder of the agent. */
  root: string;
  /** CLAUDE_ALLOW_SECRETS: paths or basenames, whitespace or colon separated. */
  allow?: string;
  /** conf/betterleaks.toml beside this file. */
  config: string;
}

/** The verdict. `block` is the message for the model. */
export interface Verdict {
  block?: string;
  /** Messages for the user that do not block, such as a capped scan. */
  warnings: string[];
}

/**
 * Each betterleaks run gets its own cap. Do not use the --timeout of
 * betterleaks: it stops the scan and exits 0, so a cut scan reads as clean.
 */
const CAP_MS = 4000;
/** Above this size a binary keeps its own name, so its extension can exempt it. */
const COPY_MAX = 100 * 1024 * 1024;
/** Found leaks exit 9, so the error exit of 1 stays apart and allows. */
const FLAGS = [
  "--no-banner",
  "--redact",
  "--log-level",
  "error",
  "--exit-code",
  "9",
  "-f",
  "json",
];

/**
 * A `git commit`: `git` anywhere, and `commit` as a word with whitespace
 * before it. So `git -C . commit` matches, and `git add .git/hooks/commit-msg`
 * and `hooks/block-secret-commits/` do not.
 */
function isCommit(command: string): boolean {
  return (
    command.includes("git") && /(^|\s)commit([^A-Za-z0-9_-]|$)/.test(command)
  );
}

/**
 * Whether the command has `-a` or `--all`, which stage tracked changes after
 * the hook has run. The text from `-m ` or `--message` on is not read, so a
 * message that holds `-a` is not a flag.
 */
function stagesAll(command: string): boolean {
  const flags = command.split("-m ")[0]!.split("--message")[0]!;
  return /(^|\s)(-[a-zA-Z]*a|--all(\s|$))/.test(flags);
}

/** A path is allowed when the list holds the path or its basename. */
const allowed = (list: string[], path: string) =>
  list.includes(path) || list.includes(path.slice(path.lastIndexOf("/") + 1));

/**
 * The verdict for a Bash command. The binary scan fails closed: an error in
 * it blocks. The content scan fails open: an error in it allows.
 */
export async function check(
  command: string,
  io: Io,
  settings: Settings,
): Promise<Verdict> {
  const warnings: string[] = [];
  if (!isCommit(command)) return { warnings };
  let setup: Setup;
  try {
    setup = await prepare(io, settings);
    const offenders = await scanBinary(io, setup);
    if (offenders.length)
      return { block: binaryMessage(offenders, settings.root), warnings };
  } catch (error) {
    return {
      block: `Blocked: the binary scan of this commit failed, so it could not clear the new binary files: ${(error as Error).message}`,
      warnings,
    };
  }
  try {
    const block = await scanContent(
      command,
      io,
      setup,
      settings.root,
      warnings,
    );
    return { block, warnings };
  } catch {
    // Fail open: a broken content scan must not block every commit.
    return { warnings };
  }
}

/** The allowlist, and betterleaks with the config to pass, if installed. */
async function prepare(io: Io, settings: Settings) {
  // .claude-allow-secrets, without blank and `#` lines, and CLAUDE_ALLOW_SECRETS.
  const file = (await io.read(`${settings.root}/.claude-allow-secrets`)) ?? "";
  const list = [
    ...file.split("\n").filter((line) => line && !line.startsWith("#")),
    ...(settings.allow ?? "").split(/[\s:]+/).filter(Boolean),
  ];
  // Ask betterleaks which config it would take. "default" means that nothing
  // selected one, so this hook may pass its own.
  const picked = await io.run(["betterleaks", "config", "path"]);
  const config =
    picked?.stdout.trim() === "default" &&
    (await io.size(settings.config)) !== undefined
      ? ["--config", settings.config]
      : [];
  return { list, betterleaks: picked !== undefined, config };
}

type Setup = Awaited<ReturnType<typeof prepare>>;

/**
 * The newly added binary files that hold a secret or that cannot be scanned.
 * git selects the files that it cannot diff as text, which are the files
 * that `betterleaks git` skips, and `betterleaks dir` reads them.
 */
async function scanBinary(io: Io, setup: Setup): Promise<string[]> {
  const diff = await io.run([
    "git",
    "diff",
    "--cached",
    "--numstat",
    "-z",
    "--diff-filter=A",
  ]);
  const binaries = (diff?.exitCode === 0 ? diff.stdout.split("\0") : [])
    .filter((record) => record.startsWith("-\t-\t"))
    .map((record) => record.slice(4))
    .filter((path) => !allowed(setup.list, path));
  // No scanner: no file can be cleared.
  if (!setup.betterleaks) return binaries;
  const offenders: string[] = [];
  const real: { path: string; size: number }[] = [];
  for (const path of binaries) {
    const size = await io.size(path);
    // Unreadable or removed from the worktree: it cannot be cleared.
    if (size === undefined) offenders.push(path);
    else real.push({ path, size });
  }
  if (!real.length) return offenders;
  // The default config exempts image, font, and office extensions from every
  // rule, so each file is scanned as a copy with a neutral name.
  const stage = await io.tempDir();
  try {
    const scan: string[] = [];
    for (const [i, { path, size }] of real.entries()) {
      const copy = `${stage}/${i}.dat`;
      scan.push(
        stage && size <= COPY_MAX && (await io.copy(path, copy)) ? copy : path,
      );
    }
    const dir = (paths: string[]) =>
      io.run(
        [
          "betterleaks",
          "dir",
          ...paths,
          ...setup.config,
          ...FLAGS,
          "-r",
          "/dev/null",
        ],
        CAP_MS,
      );
    // One scan for all files. Only a dirty set pays to find which file.
    if ((await dir(scan))?.exitCode !== 0)
      for (const [i, path] of scan.entries())
        if ((await dir([path]))?.exitCode !== 0) offenders.push(real[i]!.path);
  } finally {
    if (stage) await io.remove(stage);
  }
  return offenders;
}

function binaryMessage(offenders: string[], root: string): string {
  return [
    "Blocked: this commit would add binary file(s) that hold a secret, or that could not be scanned:",
    ...offenders.map((path) => `  - ${path}`),
    "",
    "Fix one of:",
    "  * drop the file, or add it to .gitignore if it is build output (recommended), or",
    `  * list the path(s) in ${root}/.claude-allow-secrets (persistent, per-repo), or`,
    "  * set CLAUDE_ALLOW_SECRETS to the path(s), colon-separated (one-off)",
    "",
    "Inspect with: betterleaks dir <path> --redact --verbose",
  ].join("\n");
}

interface Finding {
  File?: string;
  RuleID?: string;
  StartLine?: number;
  Fingerprint?: string;
}

/**
 * The block message for a secret value or a secret file name in the staged
 * content, or in the working tree for `git commit -a`. A missing scanner, a
 * scan error, and a capped scan allow.
 */
async function scanContent(
  command: string,
  io: Io,
  setup: Setup,
  root: string,
  warnings: string[],
): Promise<string | undefined> {
  if (!setup.betterleaks) return undefined;
  const scan = async (mode: string) => {
    const ran = await io.run(
      ["betterleaks", "git", mode, ...setup.config, ...FLAGS, "-r", "-"],
      CAP_MS,
    );
    if (ran?.timedOut)
      warnings.push(
        `Warning: betterleaks hit the ${CAP_MS / 1000}s scan cap on 'git ${mode}', so this commit was NOT scanned for secret values. Run 'betterleaks git ${mode} --redact' by hand before you trust it.`,
      );
    return ran?.exitCode === 9 ? (JSON.parse(ran.stdout) as Finding[]) : [];
  };
  let mode = "--staged";
  let where = "staged content";
  let findings = await scan(mode);
  if (!findings.length && stagesAll(command)) {
    mode = "--pre-commit";
    where = "working tree, which `git commit -a` stages for you";
    findings = await scan(mode);
  }
  // The allowlist covers the content scan too, so one list covers every check.
  const lines = findings
    .filter((finding) => finding.File && !allowed(setup.list, finding.File))
    .map(
      (f) =>
        `  - ${f.RuleID} in ${f.File}:${f.StartLine} (fingerprint: ${f.Fingerprint})`,
    );
  if (!lines.length) return undefined;
  return [
    `Blocked: betterleaks flagged the ${where}:`,
    ...lines,
    "",
    "A 'secret-filename' rule means the file name alone marks it as a secret.",
    "Any other rule means a secret value was found on that line.",
    "",
    `Inspect with: betterleaks git ${mode} --redact --verbose`,
    // Portable fixes first: the betterleaks ones work for anyone who scans
    // this repo, the local list only for a user of this hook.
    "Fix one of:",
    "  * remove the secret, or add the file to .gitignore (recommended), or",
    "  * mark a false positive with a 'betterleaks:allow' comment on the line, or",
    `  * add the fingerprint above to ${root}/.betterleaksignore, or`,
    `  * last resort, and not portable to anyone without this hook: list the file in ${root}/.claude-allow-secrets`,
  ].join("\n");
}
