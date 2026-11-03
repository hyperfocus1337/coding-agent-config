/** Run all supported tracked and untracked files: node repository.ts [directory]. */
import { check } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

if (process.argv.length > 3) {
  process.stderr.write("Usage: node repository.ts [directory]\n");
  process.exitCode = 2;
} else {
  const cwd = process.argv[2] || process.cwd();
  try {
    const result = await check(cwd, nodeIo(cwd), { ...nodeSettings(), all: true });
    if (result) {
      process.stderr.write(result);
      process.exitCode = 1;
    } else process.stdout.write("Repository code checks passed.\n");
  } catch (error) {
    process.stderr.write(`Repository code check failed: ${String(error)}\n`);
    process.exitCode = 1;
  }
}
