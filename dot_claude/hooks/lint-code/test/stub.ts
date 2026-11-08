/** A stub Io for the unit cases: the files that exist, their text, and a record of each run. */
import type { Io } from "../core.ts";

export const settings = { configDir: "/cfg" };

/** Each run fails with "<program> says no", so lint reports it. */
export function stub(files: string[] = [], texts: Record<string, string> = {}) {
  const ran: string[][] = [];
  const dirs: (string | undefined)[] = [];
  const io: Io = {
    stat: async (file) => (files.includes(file) ? { isFile: true } : undefined),
    read: async (file) => texts[file] ?? "",
    run: async (argv, options) => {
      ran.push(argv);
      dirs.push(options?.cwd);
      return { exitCode: 1, output: `${argv[0]} says no\n` };
    },
  };
  return { io, ran, dirs };
}
