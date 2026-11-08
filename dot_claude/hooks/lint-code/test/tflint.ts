/** Unit cases for linters/tflint.ts. check.ts runs them. */
import assert from "node:assert/strict";
import { tflint } from "../linters/tflint.ts";
import { settings, stub } from "./stub.ts";

// Runs in the module folder, with --filter for the file and the bundled config as fallback.
assert.deepEqual(await tflint.command("/m/main.tf", stub().io, settings), {
  argv: [
    "tflint",
    "--config=/cfg/.tflint.hcl",
    "--filter=main.tf",
    "--format=compact",
    "--no-color",
  ],
  cwd: "/m",
});
// A module config wins over the bundled config.
for (const own of ["/m/.tflint.hcl", "/m/.tflint.json"]) {
  const found = await tflint.command("/m/main.tf", stub([own]).io, settings);
  assert.equal(found?.argv[1], "--filter=main.tf");
}
// A plugin that tflint --init did not install is a coverage gap, not a lint error.
assert.ok(tflint.unavailable?.test('Plugin missing. Did you run "tflint --init"?\n'));
assert.ok(!tflint.unavailable?.test("main.tf:1:1: Error - bad instance type\n"));
