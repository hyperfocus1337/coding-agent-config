import type { Linter } from "../core.ts";

/** ruff check finds its own config: pyproject.toml, ruff.toml, or .ruff.toml. */
export const ruff: Linter = {
  key: "py",
  extensions: ["py"],
  tools: ["ruff"],
  command: async (file) => ({ argv: ["ruff", "check", "--quiet", file] }),
};
