import type { Io, Run } from "../core.ts";

/** The folder of a path. */
export const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

/**
 * The runs of a formatter that takes one file for each run, in the folder of the file. A file
 * that does not parse then stops only its own run: terraform fmt exits 2 and skips the files after
 * it. A run takes about 15 ms. Not in ../core.ts, which imports each formatter.
 */
export const eachFile =
  (argv: (file: string, io: Io) => Promise<string[]>) =>
  (files: string[], _cwd: string, io: Io): Promise<Run[]> =>
    Promise.all(files.map(async (file) => ({ argv: await argv(file, io), cwd: parent(file) })));
