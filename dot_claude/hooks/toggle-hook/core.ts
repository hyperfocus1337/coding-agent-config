/**
 * The toggle-hook logic: `/toggle-hook <hook>` turns an advisory hook off or
 * on until you quit the agent, and `/toggle-hook --repo <hook>` or
 * `--global <hook>` turns it off or on in git config, across sessions. The
 * session state is AGENT_HOOKS_DISABLE, a list of hook names in the agent's
 * own environment. The git config state is agent-hook.<hook>.enabled, and
 * agent-hook.<hook>.<formatter> for one formatter of a hook, in the
 * repository or in the global config. Each hook in HOOKS reads both on each
 * run. The adapters read and write the variable, and pass in a git function.
 *
 * Adapters: hooks/register.ts (Claude Code), pi.ts (pi and omp). Codex has no
 * extension commands, so set the variable when you start it, or run git
 * config yourself. README.md.
 */

/** The hooks that read AGENT_HOOKS_DISABLE, in the order the list shows. */
export const HOOKS = [
  "format-oxfmt",
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
export const PARTS = new Map([["format-code", ["terraform", "shfmt", "ruff"]]]);

/** The names that `--repo` and `--global` take: each hook, then its formatters. */
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
export type Git = (args: string[]) => Promise<{ exitCode: number; stdout: string } | undefined>;

/**
 * Where git config sets a key: the repository, or a file outside it, such as
 * ~/.gitconfig or ~/.config/git/config.
 */
export type Scope = "repo" | "global";

/**
 * The names that git config sets, as the hooks read them: the value and the
 * scope. A name that is unset, or set to a value that is not a boolean, is
 * not in the map: the hook then keeps its default.
 */
export type Config = Map<string, { on: boolean; scope: Scope }>;

/** The git config key of a name of NAMES. */
const key = (name: string) =>
  name.includes(".") ? `agent-hook.${name}` : `agent-hook.${name}.enabled`;

/** Whether git config leaves a name on: its value, else on. */
const gitOn = (name: string, config: Config) => config.get(name)?.on ?? true;

/** The scope where git config turns a name off, else undefined. */
function moved(name: string, config: Config): Scope | undefined {
  const set = config.get(name);
  return set && !set.on ? set.scope : undefined;
}

/** The text for a scope: "for this repository", "in the global git config". */
const where = (scope: Scope) =>
  scope === "repo" ? "for this repository" : "in the global git config";

/** The flag of a scope. */
const flag = (scope: Scope) => (scope === "repo" ? "--repo" : "--global");

/** The hook names in a AGENT_HOOKS_DISABLE value: space or comma. */
function names(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).filter(Boolean);
}

/**
 * The git config of the session folder for each name of NAMES. One
 * `git config --get` for each key, as the hooks read it, and one list of the
 * keys of the repository for the scope. A folder outside git has no
 * repository keys. With `--global`, only the global config.
 */
export async function readConfig(git: Git, only?: "--global"): Promise<Config> {
  // A read of one file follows an include only with --includes. The hooks
  // read all files, which follows each include.
  const level = only ? [only, "--includes"] : [];
  const [here, ...values] = await Promise.all([
    only ? undefined : git(["config", "--local", "--name-only", "--get-regexp", "^agent-hook\\."]),
    ...NAMES.map((name) => git(["config", ...level, "--type=bool", "--get", key(name)])),
  ]);
  const local = new Set(here?.exitCode === 0 ? here.stdout.split("\n").filter(Boolean) : []);
  const config: Config = new Map();
  NAMES.forEach((name, i) => {
    const value = values[i]?.stdout.trim();
    if (value === "true" || value === "false")
      config.set(name, {
        on: value === "true",
        scope: local.has(key(name)) ? "repo" : "global",
      });
  });
  return config;
}

/** The text for a name that is not a guard and not in `known`. */
function unknown(name: string, known: string[]): string | undefined {
  const guard = GUARDS.get(name);
  if (guard) return `${name} is a guard and has no toggle. ${guard}`;
  if (!known.includes(name)) return `${name} is not a hook. The hooks: ${known.join(", ")}, all.`;
}

/** The state of each name, with the scope that moves it off its default. */
function list(off: string[], config: Config): string {
  return NAMES.map((name) => {
    const [hook = "", part] = name.split(".");
    const session = !part && off.includes(name) && gitOn(name, config);
    const scope = session ? "session" : (moved(name, config) ?? "");
    const on = gitOn(name, config) && !session;
    const line = `${on ? "on " : "off"}  ${scope.padEnd(7)}  ${part ?? hook}`;
    return (part ? `  ${line}` : line).trimEnd();
  }).join("\n");
}

/**
 * Runs `/toggle-hook <args>` with no `--repo` or `--global`, on the current
 * AGENT_HOOKS_DISABLE and the git config. Returns the new value (undefined:
 * unset the variable) and the text for the user. No argument lists the
 * state of each hook, a hook name flips it, and `all` turns every hook off,
 * or on again when one is off. A name that is not in HOOKS, for example one
 * set at launch, stays in the value. The session can only turn a hook off:
 * a hook that git config turns off stays off, and the text names the flag.
 */
export function toggle(
  current: string | undefined,
  args: string,
  config: Config = new Map(),
): { value: string | undefined; text: string } {
  const off = names(current);
  const name = args.trim();
  const value = (list: string[]) => list.join(" ") || undefined;
  const same = (text: string) => ({ value: current, text });
  if (!name) return same(list(off, config));
  if (name === "all") {
    const others = off.filter((hook) => !HOOKS.includes(hook));
    const still = HOOKS.filter((hook) => moved(hook, config));
    return HOOKS.some((hook) => off.includes(hook))
      ? {
          value: value(others),
          text: still.length
            ? `All hooks are on, but git config turns off ${still.join(", ")}. Use /toggle-hook --repo or --global.`
            : "All hooks are on.",
        }
      : {
          value: value([...others, ...HOOKS]),
          text: "All hooks are off until you quit the agent.",
        };
  }
  if (NAMES.includes(name) && !HOOKS.includes(name))
    return same(
      `${name} has a toggle in git config only. Use /toggle-hook --repo ${name} or --global ${name}.`,
    );
  const wrong = unknown(name, HOOKS);
  if (wrong) return same(wrong);
  const scope = moved(name, config);
  if (scope)
    return same(`${name} is off ${where(scope)}. Use /toggle-hook ${flag(scope)} ${name}.`);
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

/** One change to git config: the name, and whether to turn it on or off. */
export interface Write {
  name: string;
  on: boolean;
}

/**
 * Runs `/toggle-hook --repo <name>` or `--global <name>`: flips one name of
 * NAMES in one scope of git config, or with `all` flips every hook. `config`
 * is the state that the flip starts from: for `--global`, the global config
 * only, so that a repository key does not decide the global flip. Returns
 * the writes and the text for the user. No name lists the state, as with no
 * flag.
 */
export function toggleConfig(
  current: string | undefined,
  args: string,
  config: Config,
  scope: Scope,
): { writes: Write[]; text: string } {
  const name = args.trim();
  const same = (text: string) => ({ writes: [], text });
  if (!name) return same(list(names(current), config));
  if (name === "all") {
    const off = HOOKS.filter((hook) => !gitOn(hook, config));
    return off.length
      ? {
          writes: off.map((name) => ({ name, on: true })),
          text: `All hooks are on ${where(scope)}.`,
        }
      : {
          writes: HOOKS.map((name) => ({ name, on: false })),
          text: `All hooks are off ${where(scope)}.`,
        };
  }
  const wrong = unknown(name, NAMES);
  if (wrong) return same(wrong);
  const on = !gitOn(name, config);
  return {
    writes: [{ name, on }],
    text: `${name} is ${on ? "on" : "off"} ${where(scope)}.`,
  };
}

/**
 * The file that `--global` writes: GIT_CONFIG_GLOBAL, else ~/.gitconfig.
 * Plain `git config --global` writes to ~/.config/git/config when
 * ~/.gitconfig does not exist, and chezmoi manages that file. Git reads
 * ~/.gitconfig after it, so a value there wins.
 */
export function globalFile(env: { GIT_CONFIG_GLOBAL?: string; HOME?: string }): string | undefined {
  return env.GIT_CONFIG_GLOBAL || (env.HOME && `${env.HOME}/.gitconfig`);
}

/**
 * Runs `/toggle-hook <args>`: reads the git config with `git`, and writes it
 * for `--repo`, and for `--global` to `global` (see globalFile). Returns the
 * new AGENT_HOOKS_DISABLE value, the text, and the git config after the
 * run, for the status line.
 */
export async function command(
  current: string | undefined,
  args: string,
  git: Git,
  global?: string,
): Promise<{ value: string | undefined; text: string; config: Config }> {
  const before = await readConfig(git);
  const [option, ...rest] = args.trim().split(/\s+/);
  const scope: Scope | undefined =
    option === "--repo" ? "repo" : option === "--global" ? "global" : undefined;
  if (!scope) return { ...toggle(current, args, before), config: before };
  const name = rest.join(" ");
  // No name lists the state that the hooks see.
  if (!name) return { ...toggle(current, "", before), config: before };
  const basis = scope === "global" ? await readConfig(git, "--global") : before;
  const { writes, text } = toggleConfig(current, name, basis, scope);
  const level = scope === "repo" ? ["--local"] : global ? ["--file", global] : ["--global"];
  for (const { name, on } of writes) {
    // A name back on loses its key, so that the git config stays clean.
    const argv = on ? ["--unset", key(name)] : [key(name), "false"];
    const ran = await git(["config", ...level, ...argv]);
    // --local fails outside a git repository. --unset exits 5 when the scope
    // does not set the key.
    if (ran?.exitCode !== 0 && !(argv[0] === "--unset" && ran?.exitCode === 5))
      return {
        value: current,
        text: `Not changed: git config failed for ${name}.${scope === "repo" ? " --repo needs a git repository." : ""}`,
        config: before,
      };
  }
  // A key in a file outside the repository, such as ~/.config/git/config,
  // can still keep a name from the state it should have. A value written in
  // the scope wins over it.
  const missed = (config: Config) => writes.filter(({ name, on }) => gitOn(name, config) !== on);
  let after = await readConfig(git);
  const outside = missed(after).filter(({ name }) => after.get(name)?.scope === "global");
  if (outside.length) {
    for (const { name, on } of outside) await git(["config", ...level, key(name), String(on)]);
    after = await readConfig(git);
  }
  // A global write cannot win over the repository.
  const kept = missed(after).map(({ name }) => name);
  return {
    value: current,
    text: kept.length
      ? `${text} This repository overrides ${kept.join(", ")}: use /toggle-hook --repo.`
      : text,
    config: after,
  };
}

/** The status line text while a hook is off. */
export function status(value: string | undefined, config: Config = new Map()): string | undefined {
  const session = names(value);
  const off = NAMES.flatMap((name) => {
    const scope = moved(name, config);
    if (scope) return [`${name} (${scope})`];
    return HOOKS.includes(name) && session.includes(name) ? [name] : [];
  });
  return off.length ? `hooks off: ${off.join(", ")}` : undefined;
}
