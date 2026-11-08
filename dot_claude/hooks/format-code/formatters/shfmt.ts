import type { Formatter } from "../core.ts";

const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

export const shfmt: Formatter = {
  name: "shfmt",
  key: "shfmt",
  extensions: ["sh", "bash"],
  // Any printer flag makes shfmt ignore .editorconfig. So the flags only where no .editorconfig
  // applies, else shfmt indents with tabs. README "shfmt and .editorconfig".
  argv: async (file, io) => {
    for (let dir = parent(file); ; dir = parent(dir)) {
      if ((await io.stat(`${dir}/.editorconfig`))?.kind === "file")
        return ["shfmt", "-l", "-w", file];
      if (dir === "/") return ["shfmt", "-l", "-w", "-i", "2", "-ci", file];
    }
  },
};
