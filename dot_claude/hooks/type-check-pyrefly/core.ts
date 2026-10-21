/**
 * The type-check-pyrefly logic: runs `pyrefly check` on the whole project
 * once, when the agent stops, if git reports a changed Python file. Follows
 * the pyrefly agentic-loop advice (pyrefly.org/blog/pyrefly-agentic-loop):
 * run the checker at the project root and hand the errors to the model. The
 * adapters pass in the process function, and each adapter keeps its own loop
 * guard. type-check-tsc is the same hook for TypeScript.
 *
 * Adapters: pi.ts (pi), omp.ts (omp), command.ts (Claude Code and Codex).
 * Why a stop and not each edit: ../type-check-tsc/README.md.
 */

export interface Io {
  /**
   * The exit code, stdout, and stderr; undefined when the program cannot
   * start or runs past its time.
   */
  run(
    argv: string[],
    cwd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string } | undefined>;
}

export interface Settings {
  /** AGENT_HOOKS_DISABLE: the hooks /toggle-hook turned off. */
  hooksOff?: string;
}

/** The name of this hook in AGENT_HOOKS_DISABLE and in git config. */
const HOOK = "type-check-pyrefly";

/** Type-checks the repository that holds `cwd`; the errors, or undefined. */
export async function check(
  cwd: string,
  io: Io,
  settings: Settings,
): Promise<string | undefined> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes(HOOK))
    return undefined;
  // Outside a work tree there is nothing to compare, so skip. Run from the
  // root, so pyrefly sees the same scope as the changed-path list.
  const top = await io.run(["git", "rev-parse", "--show-toplevel"], cwd);
  if (top?.exitCode !== 0) return undefined;
  const root = top.stdout.replace(/\n$/, "");
  // /toggle-hook --repo turns the hook off in the git config of the
  // repository. A value that is not a boolean keeps it on.
  const key = `agent-hook.${HOOK}.enabled`;
  const off = await io.run(
    ["git", "config", "--type=bool", "--get", key],
    root,
  );
  if (off?.stdout.trim() === "false") return undefined;
  // Tracked edits against HEAD plus untracked files, without deleted files.
  // A diff with no HEAD (the first commit) fails and adds nothing.
  // shortcut: a git diff also covers work from before the session. The
  // upgrade is the edited paths from the transcript.
  const git = async (...args: string[]) => {
    const ran = await io.run(["git", ...args], root);
    return ran?.exitCode === 0 ? ran.stdout.split("\0") : [];
  };
  const changed = [
    ...(await git("diff", "--name-only", "-z", "--diff-filter=d", "HEAD")),
    ...(await git("ls-files", "-z", "--others", "--exclude-standard")),
  ];
  if (!changed.some((path) => path.endsWith(".py"))) return undefined;

  // A missing pyrefly is a skip. pyrefly exits 1 when its config matches no
  // files, which is nothing to check, not a type error.
  const ran = await io.run(["pyrefly", "check"], root);
  if (!ran || ran.exitCode === 0) return undefined;
  const output = (ran.stdout + ran.stderr).replace(/\n+$/, "");
  if (output.includes("No Python files matched")) return undefined;
  return `${output}\nType check failed. Fix the errors above, then stop.\n`;
}
