import type { Linter } from "../core.ts";
import { bundledConfig } from "./find-config.ts";

export const tflint: Linter = {
  key: "tf",
  extensions: ["tf"],
  // tflint lints a whole module, so it runs in the folder of the file, and --filter keeps the
  // issues of this file. With --chdir, --filter matches nothing (tflint 0.64.0). A .tflint.hcl
  // or .tflint.json of the module wins over the bundled config.
  async command(file, io, settings) {
    const slash = file.lastIndexOf("/");
    const dir = file.slice(0, slash) || "/";
    const own = (await io.stat(`${dir}/.tflint.hcl`)) ?? (await io.stat(`${dir}/.tflint.json`));
    const fallback = own ? undefined : await bundledConfig(".tflint.hcl", io, settings);
    return {
      argv: [
        "tflint",
        ...(own ? [] : [`--config=${fallback}`]),
        `--filter=${file.slice(slash + 1)}`,
        "--format=compact",
        "--no-color",
      ],
      cwd: dir,
    };
  },
  // A plugin that `tflint --init` did not install.
  unavailable: /Did you run "tflint --init"\?/,
};
