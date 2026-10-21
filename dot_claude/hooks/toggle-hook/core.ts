/**
 * The toggle-hook logic: `/toggle-hook <hook>` turns an advisory hook off or
 * on until you quit the agent, and `/toggle-hook --repo <hook>` turns it off
 * or on in one repository, across sessions. The session state is
 * AGENT_HOOKS_DISABLE, a list of hook names in the agent's own environment.
 * The repository state is git config: agent-hook.<hook>.enabled false, and
 * agent-hook.<hook>.<formatter> false for one formatter of a hook. Each hook
 * in HOOKS reads both on each run and does nothing when either turns it off.
 * The adapters read and write the variable, and pass in a git function.
 *
 * Adapters: hooks/register.ts (Claude Code), pi.ts (pi and omp). Codex has no
 * extension commands, so set the variable when you start it, or run git
 * config yourself. README.md.
 */

/** The hooks that read AGENT_HOOKS_DISABLE, in the order the list shows. */
export const HOOKS = [
  "format-prettier",
  "format-org-tables",
  "format-code",
  "lint-code",
  "lint-prose",
  "type-check-tsc",
  "type-check-pyrefly",
];

/**
 * The formatters of a hook that have their own git config key, so that
 * `--repo format-code.shfmt` turns off one formatter. The same keys are in
 * FORMATTERS in format-code/core.ts, and test/check.ts keeps them the same.
 */
export const PARTS = new Map([["format-code", ["terraform", "shfmt"]]]);

/** The names that `--repo` takes: each hook, then its formatters. */
export const NAMES = HOOKS.flatMap((hook) => [
  hook,
  ...(PARTS.get(hook) ?? []).map((part) => `${hook}.${part}`),
]);

/**
 * The guards have no toggle: what to use in place of one. A Map, so that a
 * name such as `constructor` does not find an Object.prototype property.
 */
const GUARDS = new Map([
  ["enforce-cli-tools", "Use .agent-allow-cli-tools in the repo."],
  ["block-commit-attribution", "Remove the trailer from the commit message."],
  ["block-secret-commits", "Use .agent-allow-secrets in the repo."],
]);

/** Runs git in the session folder: the exit code and stdout, or undefined. */
export type Git = (
  args: string[],
) => Promise<{ exitCode: number; stdout: string } | undefined>;

/** The git config key of a name of NAMES. */
const key = (name: string) =>
  name.includes(".") ? `agent-hook.${name}` : `agent-hook.${name}.enabled`;

/** The hook names in a AGENT_HOOKS_DISABLE value: space or comma. */
function names(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).filter(Boolean);
}

/**
 * The names of NAMES that the git config of the session folder turns off.
 * One `git config --get` for each key, as the hooks read it: a value that is
 * not a boolean, or a folder outside git, keeps the name on.
 */
export async function repoOff(git: Git): Promise<string[]> {
  const off = await Promise.all(
    NAMES.map(
      async (name) =>
        (
          await git(["config", "--type=bool", "--get", key(name)])
        )?.stdout.trim() === "false",
    ),
  );
  return NAMES.filter((_, i) => off[i]);
}

/** The text for a name that is not a guard and not in `known`. */
function unknown(name: string, known: string[]): string | undefined {
  const guard = GUARDS.get(name);
  if (guard) return `${name} is a guard and has no toggle. ${guard}`;
  if (!known.includes(name))
    return `${name} is not a hook. The hooks: ${known.join(", ")}, all.`;
}

/** The state of each name, with the scope that turns it off. */
function list(off: string[], repo: string[]): string {
  return NAMES.map((name) => {
    const [hook = "", part] = name.split(".");
    const scope = repo.includes(name)
      ? "repo"
      : !part && off.includes(name)
        ? "session"
        : "";
    const line = `${scope ? "off" : "on "}  ${scope.padEnd(7)}  ${part ?? hook}`;
    return (part ? `  ${line}` : line).trimEnd();
  }).join("\n");
}

/**
 * Runs `/toggle-hook <args>` with no `--repo`, on the current
 * AGENT_HOOKS_DISABLE and the names that the repository turns off. Returns
 * the new value (undefined: unset the variable) and the text for the user.
 * No argument lists the state of each hook, a hook name flips it, and `all`
 * turns every hook off, or on again when one is off. A name that is not in
 * HOOKS, for example one set at launch, stays in the value. A hook that the
 * repository turns off stays off: the text names `--repo`.
 */
export function toggle(
  current: string | undefined,
  args: string,
  repo: string[] = [],
): { value: string | undefined; text: string } {
  const off = names(current);
  const name = args.trim();
  const value = (list: string[]) => list.join(" ") || undefined;
  const same = (text: string) => ({ value: current, text });
  if (!name) return same(list(off, repo));
  if (name === "all") {
    const others = off.filter((hook) => !HOOKS.includes(hook));
    const still = HOOKS.filter((hook) => repo.includes(hook));
    return HOOKS.some((hook) => off.includes(hook))
      ? {
          value: value(others),
          text: still.length
            ? `All hooks are on, but this repository turns off ${still.join(", ")}. Use /toggle-hook --repo.`
            : "All hooks are on.",
        }
      : {
          value: value([...others, ...HOOKS]),
          text: "All hooks are off until you quit the agent.",
        };
  }
  if (NAMES.includes(name) && !HOOKS.includes(name))
    return same(
      `${name} has a toggle for the repository only. Use /toggle-hook --repo ${name}.`,
    );
  const wrong = unknown(name, HOOKS);
  if (wrong) return same(wrong);
  if (repo.includes(name))
    return same(
      `${name} is off for this repository. Use /toggle-hook --repo ${name}.`,
    );
  return off.includes(name)
    ? {
        value: value(off.filter((hook) => hook !== name)),
        text: `${name} is on.`,
      }
    : {
        value: value([...off, name]),
        text: `${name} is off until you quit the agent.`,
      };
}

/**
 * Runs `/toggle-hook --repo <name>`: flips one name of NAMES in the git
 * config of the session repository, or with `all` flips every hook. Returns
 * the names to turn off and on, and the text for the user. No name lists the
 * state, as with no `--repo`.
 */
export function toggleRepo(
  current: string | undefined,
  args: string,
  repo: string[],
): { off: string[]; on: string[]; text: string } {
  const name = args.trim();
  const same = (text: string) => ({ off: [], on: [], text });
  if (!name) return same(list(names(current), repo));
  if (name === "all") {
    const off = HOOKS.filter((hook) => repo.includes(hook));
    return off.length
      ? { off: [], on: off, text: "All hooks are on for this repository." }
      : { off: HOOKS, on: [], text: "All hooks are off for this repository." };
  }
  const wrong = unknown(name, NAMES);
  if (wrong) return same(wrong);
  return repo.includes(name)
    ? { off: [], on: [name], text: `${name} is on for this repository.` }
    : { off: [name], on: [], text: `${name} is off for this repository.` };
}

/**
 * Runs `/toggle-hook <args>`: reads the repository state with `git`, and
 * writes it for `--repo`. Returns the new AGENT_HOOKS_DISABLE value, the
 * text, and the repository state after the run, for the status line.
 */
export async function command(
  current: string | undefined,
  args: string,
  git: Git,
): Promise<{ value: string | undefined; text: string; repo: string[] }> {
  const before = await repoOff(git);
  const [flag, ...rest] = args.trim().split(/\s+/);
  if (flag !== "--repo")
    return { ...toggle(current, args, before), repo: before };
  const { off, on, text } = toggleRepo(current, rest.join(" "), before);
  const writes = [
    ...off.map((name) => ({ name, argv: [key(name), "false"] })),
    ...on.map((name) => ({ name, argv: ["--unset", key(name)] })),
  ];
  for (const { name, argv } of writes) {
    const ran = await git(["config", "--local", ...argv]);
    // --local fails outside a git repository. --unset exits 5 when this
    // repository does not set the key.
    if (ran?.exitCode !== 0 && !(argv[0] === "--unset" && ran?.exitCode === 5))
      return {
        value: current,
        text: `Not changed: git config failed for ${name}. --repo needs a git repository.`,
        repo: before,
      };
  }
  // A key outside this repository, such as in ~/.config/git/config, can still
  // turn a name off. A true in this repository wins over it.
  let after = await repoOff(git);
  const still = on.filter((name) => after.includes(name));
  for (const name of still) await git(["config", "--local", key(name), "true"]);
  if (still.length) after = await repoOff(git);
  return { value: current, text, repo: after };
}

/** The status line text while a hook is off, else undefined. */
export function status(
  value: string | undefined,
  repo: string[] = [],
): string | undefined {
  const off = NAMES.flatMap((name) =>
    repo.includes(name)
      ? [`${name} (repo)`]
      : HOOKS.includes(name) && names(value).includes(name)
        ? [name]
        : [],
  );
  return off.length ? `hooks off: ${off.join(", ")}` : undefined;
}
