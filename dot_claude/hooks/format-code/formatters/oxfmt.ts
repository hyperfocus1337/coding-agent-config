import type { Formatter } from "../core.ts";

/**
 * oxfmt formats all files in one run. It uses the nearest config of each file, else its
 * defaults. docs/oxfmt.md "Config".
 */
export const oxfmt: Formatter = {
  name: "oxfmt",
  key: "oxfmt",
  // docs/oxfmt.md "Supported extensions".
  extensions:
    "md markdown js jsx ts tsx mts cts mjs cjs json jsonc json5 css scss less html yml yaml toml".split(
      " ",
    ),
  // A Bash call takes Markdown only. docs/oxfmt.md "Bash: Markdown only".
  swept: ["md", "markdown"],
  runs: async (files, cwd) => [{ argv: ["oxfmt", ...files], cwd, timeoutMs: 20_000 }],
};
