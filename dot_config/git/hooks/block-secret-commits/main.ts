/**
 * Git pre-commit hook: scans staged content and newly added binary blobs.
 * A block exits 1; warnings go to stderr without blocking. Git supplies the
 * worktree root and GIT_INDEX_FILE, including for commits that stage files.
 * Design notes: docs/implementation.md. Run: node main.ts.
 */

import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = process.cwd();
/** Each scanner run gets a cap; betterleaks' own --timeout exits 0 on timeout. */
const CAP_MS = 4000;
/** Do not export larger blobs to the temporary folder; block them instead. */
const COPY_MAX = 100 * 1024 * 1024;
/** Separate findings (9) from scanner errors (1). Never report secret values. */
const FLAGS = ["--no-banner", "--redact", "--log-level", "error", "--exit-code", "9", "-f", "json"];

interface Ran {
  exitCode: number;
  stdout: string;
  timedOut: boolean;
}

/** An optional file descriptor receives stdout without buffering blob bytes. */
function run(argv: string[], timeoutMs?: number, output?: number): Promise<Ran | undefined> {
  return new Promise((done) => {
    const [program = "", ...args] = argv;
    const child = spawn(program, args, {
      cwd: root,
      stdio: ["ignore", output ?? "pipe", "ignore"],
      timeout: timeoutMs,
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.on("error", () => done(undefined));
    child.on("close", (code, signal) =>
      done({ exitCode: code ?? -1, stdout, timedOut: signal === "SIGTERM" }),
    );
  });
}

/** A path is allowed when the list holds the path or its basename. */
const allowed = (list: string[], path: string) =>
  list.includes(path) || list.includes(path.slice(path.lastIndexOf("/") + 1));

/** Both override sources feed the same list for both scans. */
async function prepare() {
  const file = await readFile(".agent-allow-secrets", "utf8").catch(() => "");
  const list = [
    ...file.split("\n").filter((line) => line && !line.startsWith("#")),
    ...(process.env.AGENT_ALLOW_SECRETS ?? "").split(/[\s:]+/).filter(Boolean),
  ];
  const picked = await run(["betterleaks", "config", "path"]);
  // betterleaks 1.10 reads a repo config only with --unsafe-auto-load-config, and the binary scan
  // has a temporary folder as its target, so the hook passes the repo config itself.
  const own = (
    await Promise.all(
      [".betterleaks.toml", ".gitleaks.toml"].map((name) =>
        stat(`${root}/${name}`).then(
          (found) => (found.isFile() ? `${root}/${name}` : undefined),
          () => undefined,
        ),
      ),
    )
  ).find(Boolean);
  const config =
    picked?.stdout.trim() === "default"
      ? ["--config", own ?? fileURLToPath(new URL("./conf/betterleaks.toml", import.meta.url))]
      : [];
  return { list, betterleaks: picked !== undefined, config };
}

type Setup = Awaited<ReturnType<typeof prepare>>;

/** New binary blobs that hold secrets or that cannot be cleared. */
async function scanBinary(setup: Setup): Promise<string[]> {
  const diff = await run(["git", "diff", "--cached", "--numstat", "-z", "--diff-filter=A"]);
  if (diff?.exitCode !== 0) throw new Error("git could not list the staged binary files");
  const binaries = diff.stdout
    .split("\0")
    .filter((record) => record.startsWith("-\t-\t"))
    .map((record) => record.slice(4))
    .filter((path) => !allowed(setup.list, path));
  if (!binaries.length || !setup.betterleaks) return binaries;

  const offenders: string[] = [];
  const stage = await mkdtemp(`${tmpdir()}/block-secret-commits-`);
  try {
    const scan: { path: string; copy: string }[] = [];
    for (const [i, path] of binaries.entries()) {
      const blob = `:${path}`;
      const size = await run(["git", "cat-file", "-s", blob]);
      const bytes = Number(size?.stdout.trim());
      if (size?.exitCode !== 0 || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > COPY_MAX) {
        offenders.push(path);
        continue;
      }
      // Export the index blob, not the worktree file. A neutral name defeats
      // extension allowlists, also for a staged symlink or a removed file.
      const copy = `${stage}/${i}.dat`;
      const file = await open(copy, "wx");
      let exported: Ran | undefined;
      try {
        exported = await run(["git", "cat-file", "blob", blob], undefined, file.fd);
      } finally {
        await file.close();
      }
      if (exported?.exitCode === 0) scan.push({ path, copy });
      else offenders.push(path);
    }
    const dir = (paths: string[]) =>
      run(["betterleaks", "dir", ...paths, ...setup.config, ...FLAGS, "-r", "/dev/null"], CAP_MS);
    // One scan for a clean set; only a dirty set pays for per-file scans.
    if (scan.length && (await dir(scan.map(({ copy }) => copy)))?.exitCode !== 0)
      for (const { path, copy } of scan)
        if ((await dir([copy]))?.exitCode !== 0) offenders.push(path);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return offenders;
}

/** The exclude file is local to the user and shared by the repo's worktrees. */
const excludeCommand = () =>
  `echo '.agent-allow-*' >> "$(git -C "${root}" rev-parse --path-format=absolute --git-path info/exclude)"`;

function binaryMessage(offenders: string[]): string {
  return [
    "Blocked: this commit would add binary file(s) that hold a secret, or that could not be scanned:",
    ...offenders.map((path) => `  - ${path}`),
    "",
    "Binaries above 100 MiB cannot be scanned by this hook.",
    "Fix one of:",
    "  * drop the file, or add it to .gitignore if it is build output (recommended), or",
    `  * list the path(s) in ${root}/.agent-allow-secrets (persistent, per-repo),`,
    `    and keep it out of git: ${excludeCommand()}, or`,
    "  * set AGENT_ALLOW_SECRETS to the path(s), colon-separated (one-off)",
    "",
    "Inspect with: betterleaks dir <path> --redact --verbose (reads the worktree, not the index)",
  ].join("\n");
}

interface Finding {
  File?: string;
  RuleID?: string;
  StartLine?: number;
  Fingerprint?: string;
}

/** The content scan fails open, but a capped scan gives a warning. */
async function scanContent(setup: Setup): Promise<string | undefined> {
  if (!setup.betterleaks) return undefined;
  const ran = await run(
    ["betterleaks", "git", "--staged", ...setup.config, ...FLAGS, "-r", "-"],
    CAP_MS,
  );
  if (ran?.timedOut)
    process.stderr.write(
      `Warning: betterleaks hit the ${CAP_MS / 1000}s scan cap, so this commit was NOT scanned for secret values. Run 'betterleaks git --staged --redact' by hand before you trust it.\n`,
    );
  const findings = ran?.exitCode === 9 ? (JSON.parse(ran.stdout) as Finding[]) : [];
  const lines = findings
    .filter((finding) => finding.File && !allowed(setup.list, finding.File))
    .map((f) => `  - ${f.RuleID} in ${f.File}:${f.StartLine} (fingerprint: ${f.Fingerprint})`);
  if (!lines.length) return undefined;
  return [
    "Blocked: betterleaks flagged the staged content:",
    ...lines,
    "",
    "A 'secret-filename' rule means the file name alone marks it as a secret.",
    "Any other rule means a secret value was found on that line.",
    "",
    "Inspect with: betterleaks git --staged --redact --verbose",
    "Fix one of:",
    "  * remove the secret, or add the file to .gitignore (recommended), or",
    "  * mark a false positive with a 'betterleaks:allow' comment on the line, or",
    `  * add the fingerprint above to ${root}/.betterleaksignore, or`,
    `  * last resort, and not portable to anyone without this hook: list the file in ${root}/.agent-allow-secrets,`,
    `    and keep it out of git: ${excludeCommand()}`,
  ].join("\n");
}

/** A setup or binary-scan error blocks; a content-scan error allows. */
async function check(): Promise<string | undefined> {
  let setup: Setup;
  try {
    setup = await prepare();
    const offenders = await scanBinary(setup);
    if (offenders.length) return binaryMessage(offenders);
  } catch (error) {
    return `Blocked: the binary scan of this commit failed, so it could not clear the new binary files: ${(error as Error).message}`;
  }
  try {
    return await scanContent(setup);
  } catch {
    // Fail open: a broken content scan must not block every commit.
    return undefined;
  }
}

const block = await check();
if (block) {
  process.stderr.write(`${block}\n`);
  process.exitCode = 1;
}
