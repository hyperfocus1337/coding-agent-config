import type { Formatter } from "../core.ts";
import { eachFile, parent } from "./each-file.ts";

export const shfmt: Formatter = {
  name: "shfmt",
  key: "shfmt",
  extensions: ["sh", "bash"],
  // Any printer flag makes shfmt ignore .editorconfig. So the flags only where no .editorconfig
  // applies, else shfmt indents with tabs. README "shfmt and .editorconfig".
  runs: eachFile(async (file, io) => {
    for (let dir = parent(file); ; dir = parent(dir)) {
      if ((await io.stat(`${dir}/.editorconfig`))?.kind === "file")
        return ["shfmt", "-l", "-w", file];
      if (dir === "/") return ["shfmt", "-l", "-w", "-i", "2", "-ci", file];
    }
  }),
};
