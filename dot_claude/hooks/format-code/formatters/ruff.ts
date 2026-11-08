import type { Formatter } from "../core.ts";

export const ruff: Formatter = {
  name: "ruff format",
  key: "ruff",
  extensions: ["py", "pyi"],
  // --force-exclude: the exclude list of the ruff config applies also to a file that the command
  // names. Ruff prints a summary for each run, also "1 file left unchanged", so only
  // "reformatted" tells of a change.
  argv: async (file) => ["ruff", "format", "--force-exclude", file],
  changed: (stdout) => stdout.includes("reformatted"),
};
