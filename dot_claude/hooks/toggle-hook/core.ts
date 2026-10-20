/**
 * The toggle-hook logic: `/toggle-hook <hook>` turns an advisory hook off or
 * on until you quit the agent. The state is CLAUDE_HOOKS_DISABLE, a list of
 * hook names in the agent's own environment. Each hook in HOOKS reads it on
 * each run and does nothing when it is named. This file only computes: the
 * adapters read and write the variable.
 *
 * Adapters: hooks/register.ts (Claude Code), pi.ts (pi and omp). Codex has no
 * extension commands, so set the variable when you start it. README.md.
 */

/** The hooks that read CLAUDE_HOOKS_DISABLE, in the order the list shows. */
export const HOOKS = [
  "format-prettier",
  "format-org-tables",
  "format-terraform",
  "lint-code",
  "lint-prose",
  "type-check-tsc",
  "type-check-pyrefly",
];

/**
 * The guards have no toggle: what to use in place of one. A Map, so that a
 * name such as `constructor` does not find an Object.prototype property.
 */
const GUARDS = new Map([
  ["enforce-cli-tools", "Use .agent-allow-cli-tools in the repo."],
  ["block-commit-attribution", "Remove the trailer from the commit message."],
  ["block-secret-commits", "Use .agent-allow-secrets in the repo."],
]);

/** The hook names in a CLAUDE_HOOKS_DISABLE value: space or comma. */
function names(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).filter(Boolean);
}

/**
 * Runs `/toggle-hook <args>` on the current CLAUDE_HOOKS_DISABLE. Returns the
 * new value (undefined: unset the variable) and the text for the user. No
 * argument lists the state of each hook, a hook name flips it, and `all`
 * turns every hook off, or on again when one is off. A name that is not in
 * HOOKS, for example one set at launch, stays in the value.
 */
export function toggle(
  current: string | undefined,
  args: string,
): { value: string | undefined; text: string } {
  const off = names(current);
  const name = args.trim();
  const value = (list: string[]) => list.join(" ") || undefined;
  if (!name)
    return {
      value: current,
      text: HOOKS.map(
        (hook) => `${off.includes(hook) ? "off" : "on "}  ${hook}`,
      ).join("\n"),
    };
  if (name === "all") {
    const others = off.filter((hook) => !HOOKS.includes(hook));
    return HOOKS.some((hook) => off.includes(hook))
      ? { value: value(others), text: "All hooks are on." }
      : {
          value: value([...others, ...HOOKS]),
          text: "All hooks are off until you quit the agent.",
        };
  }
  const guard = GUARDS.get(name);
  if (guard)
    return {
      value: current,
      text: `${name} is a guard and has no toggle. ${guard}`,
    };
  if (!HOOKS.includes(name))
    return {
      value: current,
      text: `${name} is not a hook. The hooks: ${HOOKS.join(", ")}, all.`,
    };
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

/** The status line text while a hook is off, else undefined. */
export function status(value: string | undefined): string | undefined {
  const off = HOOKS.filter((hook) => names(value).includes(hook));
  return off.length ? `hooks off: ${off.join(", ")}` : undefined;
}
