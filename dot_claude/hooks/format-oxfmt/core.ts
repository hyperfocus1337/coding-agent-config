/**
 * The format-oxfmt logic: formats the files a tool call changed with oxfmt,
 * where git config sets agent-hook.format-oxfmt.enabled to true. Then
 * format-prettier leaves the same files alone. ./shared.ts finds the files
 * and holds the switch between the two hooks.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp),
 * command.ts (Codex, and the format-staged-files pre-commit hook).
 * Design notes: README.md.
 */

import {
  format as formatWith,
  parent,
  type Call,
  type Io,
  type Settings as SharedSettings,
} from "./shared.ts";

export type { Call, Io };

export interface Settings extends SharedSettings {
  /** The folder of oxfmtrc.json, the config for a file that has none. */
  configDir: string;
}

/** The extensions oxfmt formats after a Write or an Edit. README "Supported extensions". */
const EDITED =
  /\.(md|markdown|js|jsx|ts|tsx|mts|cts|mjs|cjs|json|jsonc|json5|css|scss|less|html|yml|yaml|toml)$/;
/** The config files oxfmt looks for, from the folder of each file up. */
const CONFIGS = [
  ".oxfmtrc.json",
  ".oxfmtrc.jsonc",
  "oxfmt.config.ts",
  "oxfmt.config.mts",
];

/** Whether `dir` or a folder above it holds an oxfmt config. */
function configured(
  dir: string,
  io: Io,
  seen: Map<string, Promise<boolean>>,
): Promise<boolean> {
  let found = seen.get(dir);
  if (!found) {
    found = (async () => {
      for (const name of CONFIGS)
        if (
          (await io.stat(`${dir.replace(/\/$/, "")}/${name}`))?.kind === "file"
        )
          return true;
      return dir !== "/" && configured(parent(dir), io, seen);
    })();
    seen.set(dir, found);
  }
  return found;
}

/**
 * Formats the files a call changed. Returns the amend hint for the model when
 * the call committed a Markdown file that oxfmt then changed, else
 * undefined. README "Write and commit in one command".
 */
export const format = (call: Call, io: Io, settings: Settings) =>
  formatWith(call, io, settings, {
    hook: "format-oxfmt",
    name: "oxfmt",
    edited: EDITED,
    // A file with an oxfmt config above it gets that config. Each other file
    // gets the bundled config, which sets the defaults of Prettier: with no
    // config, oxfmt uses a width of 100. -c turns off the search, so the two
    // sets need two runs. README "Config".
    argvs: async (files) => {
      const seen = new Map<string, Promise<boolean>>();
      const own: string[] = [];
      const bundled: string[] = [];
      for (const file of files)
        ((await configured(parent(file), io, seen)) ? own : bundled).push(file);
      return [
        ...(own.length ? [["oxfmt", ...own]] : []),
        ...(bundled.length
          ? [["oxfmt", "-c", `${settings.configDir}/oxfmtrc.json`, ...bundled]]
          : []),
      ];
    },
  });
