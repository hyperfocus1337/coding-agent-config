/**
 * Unit cases for sweep.ts, with a stub Io. format-oxfmt, format-org-tables, and
 * format-code each hold the same copy of this file. check.ts runs them.
 */
import assert from "node:assert/strict";
import { shellFiles, type SweepIo } from "../sweep.ts";

const NOW = 1_000_000_000;

/**
 * An Io over `files`, each with its mtime, `dirs`, and the stdout of each git
 * run by its cwd and first argument. `runs` records each git run.
 */
function io(
  files: Record<string, number>,
  dirs: string[],
  git: Record<string, string>,
  runs: string[] = [],
): SweepIo {
  return {
    stat: async (path) =>
      path in files
        ? { kind: "file", mtimeMs: files[path]! }
        : dirs.includes(path)
          ? { kind: "dir", mtimeMs: 0 }
          : undefined,
    run: async (argv, { cwd }) => {
      runs.push(`${cwd} ${argv[1]}`);
      return { stdout: git[`${cwd} ${argv[1]}`] ?? "" };
    },
  };
}

// The repository /r: a tracked file and an untracked file that the call
// changed, one that changed before the call, and a file of another extension.
const repo = io(
  { "/r/a.md": NOW, "/r/b.md": NOW - 500, "/r/old.md": NOW - 5_000, "/r/c.ts": NOW },
  ["/r"],
  {
    "/r rev-parse": "/r\n",
    "/r diff": "a.md\0old.md\0c.ts\0",
    "/r ls-files": "b.md\0",
  },
);

// With a start time, a file counts from the start rounded down to the second.
assert.deepEqual(
  await shellFiles({ command: "x", cwd: "/r", since: NOW - 400 }, ["md"], repo, NOW),
  ["/r/a.md", "/r/b.md"],
);
// Without one, a file counts when it changed in the last 120 s.
assert.deepEqual(await shellFiles({ command: "x", cwd: "/r" }, ["md"], repo, NOW + 110_000), [
  "/r/a.md",
  "/r/old.md",
  "/r/b.md",
]);
assert.deepEqual(await shellFiles({ command: "x", cwd: "/r" }, ["md"], repo, NOW + 121_000), []);

// A named file counts also when git does not list it, such as an ignored one.
assert.deepEqual(
  await shellFiles(
    { command: "cat > vendor/v.md", cwd: "/r", since: NOW },
    ["md"],
    io({ "/r/vendor/v.md": NOW }, ["/r"], { "/r rev-parse": "/r\n" }),
    NOW,
  ),
  ["/r/vendor/v.md"],
);

// Only the cwd and an absolute path are roots: the end of a relative path is not.
const runs: string[] = [];
await shellFiles(
  { command: "cat docs/a.md /abs/b.md > out/c.md", cwd: "/repo" },
  ["md"],
  io({}, ["/repo"], {}, runs),
);
assert.deepEqual(
  runs.filter((run) => run.endsWith("rev-parse")),
  ["/repo rev-parse", "/abs rev-parse"],
);

// An untracked repository lists with a trailing slash, and a submodule as a
// changed folder: both join the roots.
assert.deepEqual(
  (
    await shellFiles(
      { command: "x", cwd: "/r", since: NOW },
      ["md"],
      io({ "/r/n/n.md": NOW, "/r/s/s.md": NOW }, ["/r", "/r/s"], {
        "/r rev-parse": "/r\n",
        "/r diff": "s\0",
        "/r ls-files": "n/\0",
        "/r/n rev-parse": "/r/n\n",
        "/r/n ls-files": "n.md\0",
        "/r/s rev-parse": "/r/s\n",
        "/r/s diff": "s.md\0",
      }),
      NOW,
    )
  ).sort(),
  ["/r/n/n.md", "/r/s/s.md"],
);

// A command that commits also takes the files of the last commit.
const commit = io({ "/r/c.md": NOW }, ["/r"], {
  "/r rev-parse": "/r\n",
  "/r diff-tree": "c.md\0",
});
assert.deepEqual(
  await shellFiles({ command: "echo", cwd: "/r", since: NOW }, ["md"], commit, NOW),
  [],
);
assert.deepEqual(
  await shellFiles(
    { command: "git -C /r commit -m x", cwd: "/r", since: NOW },
    ["md"],
    commit,
    NOW,
  ),
  ["/r/c.md"],
);
