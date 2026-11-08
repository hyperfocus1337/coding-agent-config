import type { Formatter } from "../core.ts";

/** terraform fmt prints the name of a file that it changed, and nothing else. */
export const terraform: Formatter = {
  name: "terraform fmt",
  key: "terraform",
  extensions: ["tf", "tfvars"],
  argv: async (file) => ["terraform", "fmt", "-no-color", file],
};
