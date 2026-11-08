/** Config discovery that more than one linter uses. */
import type { Io, Settings } from "../core.ts";

/** Nearest project config, bounded by the repository root. */
export async function projectConfig(file: string, names: string[], io: Io, root?: string) {
  let dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) || "/" : ".";
  while (true) {
    for (const name of names) {
      const config = `${dir === "/" ? "" : dir}/${name}`;
      if ((await io.stat(config))?.isFile) return { config, dir };
    }
    if (dir === root || dir === "/" || dir === "." || !dir.includes("/")) return;
    dir = dir.slice(0, dir.lastIndexOf("/")) || "/";
  }
}

/** Accept both deployed names and chezmoi source names. */
export async function bundledConfig(name: string, io: Io, settings: Settings): Promise<string> {
  const deployed = `${settings.configDir}/${name}`;
  if ((await io.stat(deployed))?.isFile) return deployed;
  const source = `${settings.configDir}/dot_${name.slice(1)}`;
  return (await io.stat(source))?.isFile ? source : deployed;
}
