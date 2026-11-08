import type { Formatter } from "../core.ts";
import { eachFile } from "./each-file.ts";

export const ruff: Formatter = {
  name: "ruff format",
  key: "ruff",
  extensions: ["py", "pyi"],
  // --force-exclude: the exclude list of the ruff config applies also to a file that the command
  // names.
  runs: eachFile(async (file) => ["ruff", "format", "--force-exclude", file]),
};
