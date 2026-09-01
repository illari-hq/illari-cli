#!/usr/bin/env node
import { createRequire } from "node:module";
import { ping } from "./ping.js";
import { UsageError } from "./resolve.js";
import { run } from "./run.js";

// dist/src/index.js -> ../../package.json
const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const HELP = `illari ${version} — wrap a job and report to illari.dev

USAGE
  illari run [options] -- <command> [args...]
  illari ping [--key K | --url U] [--base B] [start | <exit> | fail]

RUN OPTIONS
  --key <key>     monitor ping key            (or ILLARI_KEY)
  --url <url>     full ping URL               (or ILLARI_URL; overrides --key)
  --base <url>    ping base for --key         (or ILLARI_BASE; default https://illari.dev/ping)
  --tail <bytes>  output kept for the completion body (default 10000, 0 to disable)
  --no-start      skip the /start ping

BEHAVIOUR
  Sends <ping>/start, runs the command with stdio passed through, then sends
  <ping>/<exit code> with the last --tail bytes of output as the body. Exits
  with the command's own exit code. Ping failures are warnings, never fatal.

EXAMPLES
  illari run --key abc123 -- ./nightly-etl.sh
  ILLARI_KEY=abc123 illari run -- pg_dump mydb | gzip > dump.sql.gz
  illari ping --key abc123            # bare check-in from a crontab line
`;

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === undefined || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(HELP);
    return cmd === undefined ? 1 : 0;
  }
  if (cmd === "-v" || cmd === "--version" || cmd === "version") {
    process.stdout.write(`${version}\n`);
    return 0;
  }
  if (cmd === "run") return run(rest);
  if (cmd === "ping") return ping(rest);
  if (cmd === "import") {
    process.stderr.write(
      "illari: `import` (read a crontab, create monitors) is not built yet.\n",
    );
    return 2;
  }

  process.stderr.write(`illari: unknown command "${cmd}". Try \`illari --help\`.\n`);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof UsageError) {
      process.stderr.write(`illari: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(
      `illari: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
