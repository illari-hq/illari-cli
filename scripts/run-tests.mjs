// Run each compiled test file as its own `node` process.
//
// `node --test <glob>` spawns a child per file and streams V8-serialized
// events back to the parent; on Node 22 that pipe intermittently fails to
// deserialize ("Unable to deserialize cloned data", nodejs/node#53497) and
// reds CI even though every assertion passed. Invoking the files directly
// skips that layer: node:test auto-runs on load and exits non-zero on
// failure. Runs every file (doesn't stop at the first) so one red file
// doesn't hide the rest.

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const dir = "dist/test";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

let failed = 0;
for (const file of files) {
  process.stdout.write(`\n# ${dir}/${file}\n`);
  const { status } = spawnSync(process.execPath, [`${dir}/${file}`], {
    stdio: "inherit",
  });
  if (status !== 0) failed++;
}

process.stdout.write(
  `\n${files.length - failed}/${files.length} test files passed\n`,
);
process.exit(failed === 0 ? 0 : 1);
