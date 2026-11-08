/** Unit cases for linters/yaml.ts: routing, config discovery, and skips. check.ts runs them. */
import assert from "node:assert/strict";
import { yaml } from "../linters/yaml.ts";
import { settings, stub } from "./stub.ts";

const command = (file: string, io = stub().io, extra: object = {}) =>
  yaml.command(file, io, { ...settings, ...extra });
const program = async (file: string, io = stub().io) => (await command(file, io))?.argv[0];

// Ansible by folder or content; generic names alone are not evidence.
const marked = stub([], {
  "x/deploy.yml": "- hosts: all\n",
  "/r/main.yaml": "plain: yaml\n",
  "/r/task.yaml": "- ansible.builtin.copy:\n    src: a\n",
}).io;
assert.equal(await program("x/site.yaml", marked), "yamllint");
assert.equal(await program("x/deploy.yml", marked), "ansible-lint");
assert.equal(await program("x/other.yml", marked), "yamllint");
assert.equal(await program("/r/main.yaml", marked), "yamllint");
assert.equal(await program("/r/requirements.yml", marked), "yamllint");
assert.equal(await program("/r/task.yaml", marked), "ansible-lint");
assert.equal(await program("/r/roles/f.yaml"), "ansible-lint");

// Project policy wins, nearest first, and discovery stops at the Git root.
for (const name of [".yamllint", ".yamllint.yaml", ".yamllint.yml"]) {
  assert.deepEqual(
    await command("/r/nested/a.yaml", stub([`/r/nested/${name}`, "/r/.yamllint"]).io, {
      root: "/r",
    }),
    { argv: ["yamllint", "--strict", "-c", `/r/nested/${name}`, "a.yaml"], cwd: "/r/nested" },
  );
}
assert.deepEqual(await command("/r/a.yaml", stub(["/.yamllint"]).io, { root: "/r" }), {
  argv: ["yamllint", "--strict", "-c", "/cfg/.yamllint", "a.yaml"],
  cwd: "/r",
});

// A project .ansible-lint does not stop the pinned yamllint fallback; a project .yamllint wins.
assert.deepEqual(await command("/r/roles/a.yaml", stub(["/r/.ansible-lint"]).io, { root: "/r" }), {
  argv: [
    "ansible-lint",
    "-c",
    "/r/.ansible-lint",
    "--yamllint-file",
    "/cfg/.yamllint",
    "-q",
    "roles/a.yaml",
  ],
  cwd: "/r",
});
const nearest = stub(["/r/.ansible-lint", "/r/roles/.yamllint.yml", "/.yamllint"]).io;
assert.equal(
  (await command("/r/roles/a.yaml", nearest, { root: "/r" }))?.argv[4],
  "/r/roles/.yamllint.yml",
);
const outside = stub(["/.yamllint"]).io;
assert.equal(
  (await command("/r/roles/a.yaml", outside, { root: "/r" }))?.argv[4],
  "/cfg/.yamllint",
);

// The repo key of ansible-lint gives Ansible YAML the yamllint checks.
assert.deepEqual(
  await command("/r/roles/a.yaml", stub().io, { root: "/r", repoOff: new Set(["ansible-lint"]) }),
  { argv: ["yamllint", "--strict", "-c", "/cfg/.yamllint", "roles/a.yaml"], cwd: "/r" },
);

// Only templates/ of a Helm chart, with its Chart.yaml, is skipped.
const helm = stub(["/r/chart/Chart.yaml"]).io;
assert.equal(await command("/r/chart/templates/a.yaml", helm), undefined);
assert.equal((await command("/r/templates/a.yaml", helm))?.argv.at(-1), "/r/templates/a.yaml");
