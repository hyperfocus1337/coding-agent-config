/**
 * yamllint and ansible-lint, in one module because they share the routing: each YAML file goes
 * to exactly one of them, and ansible-lint also reads the yamllint config.
 */
import type { Io, Linter } from "../core.ts";
import { bundledConfig, projectConfig } from "./find-config.ts";

const YAMLLINT_NAMES = [".yamllint", ".yamllint.yaml", ".yamllint.yml"];
const ANSIBLE_LINT_NAMES = [
  ".ansible-lint",
  ".ansible-lint.yml",
  ".ansible-lint.yaml",
  ".config/ansible-lint.yml",
  ".config/ansible-lint.yaml",
];

/**
 * Ansible YAML, by directory or content. Generic basenames alone are not evidence. ansible-lint
 * only runs on these; other YAML goes to yamllint.
 */
async function isAnsible(file: string, io: Io): Promise<boolean> {
  return (
    /\/(roles|tasks|handlers|playbooks|group_vars|host_vars|molecule)\//.test(file) ||
    /^\s*(?:-\s+)?(?:hosts|tasks|roles|ansible\.builtin\.[\w]+):/m.test(await io.read(file))
  );
}

/** Helm templates contain Go templates, not plain YAML. */
async function helmTemplate(file: string, io: Io): Promise<boolean> {
  const parts = file.split("/templates/");
  for (let i = 0; i < parts.length - 1; i++) {
    if ((await io.stat(`${parts.slice(0, i + 1).join("/templates/")}/Chart.yaml`))?.isFile)
      return true;
  }
  return false;
}

export const yaml: Linter = {
  key: "yaml",
  extensions: ["yml", "yaml"],
  async command(file, io, settings) {
    if (await helmTemplate(file, io)) return undefined;
    const ansible = await isAnsible(file, io);
    const own = await projectConfig(
      file,
      ansible ? ANSIBLE_LINT_NAMES : YAMLLINT_NAMES,
      io,
      settings.root,
    );
    const fallback = await bundledConfig(ansible ? ".ansible-lint" : ".yamllint", io, settings);
    const cwd = own?.dir ?? settings.root;
    const target = cwd && file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file;
    if (!ansible)
      return { argv: ["yamllint", "--strict", "-c", own?.config ?? fallback, target], cwd };
    // ansible-lint looks for a yamllint config itself, down to ~/.config/yamllint/config.
    // --yamllint-file comes first in that search, so no file outside the repository changes
    // the result.
    const yamllint =
      (await projectConfig(file, YAMLLINT_NAMES, io, settings.root))?.config ??
      (await bundledConfig(".yamllint", io, settings));
    return {
      argv: [
        "ansible-lint",
        "-c",
        own?.config ?? fallback,
        "--yamllint-file",
        yamllint,
        "-q",
        target,
      ],
      cwd,
    };
  },
};
