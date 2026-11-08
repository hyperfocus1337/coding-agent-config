import type { Linter } from "../core.ts";

/** shellcheck finds its own .shellcheckrc. -S warning drops info and style findings. */
export const shellcheck: Linter = {
  key: "sh",
  extensions: ["sh", "bash"],
  command: async (file) => ({ argv: ["shellcheck", "-S", "warning", file] }),
};
