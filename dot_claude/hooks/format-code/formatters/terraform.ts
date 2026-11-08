import type { Formatter } from "../core.ts";
import { eachFile } from "./each-file.ts";

export const terraform: Formatter = {
  name: "terraform fmt",
  key: "terraform",
  extensions: ["tf", "tfvars"],
  runs: eachFile(async (file) => ["terraform", "fmt", "-no-color", file]),
};
