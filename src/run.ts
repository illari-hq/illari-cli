import { spawn } from "node:child_process";
import { parseRunArgs } from "./args.js";
import { sendPing } from "./http.js";
import { resolvePingUrl } from "./resolve.js";
import { TailBuffer } from "./tail.js";

/**
 * `illari run` — wrap a command:
 *   - POST <ping>/start before it runs (unless --no-start)
 *   - stream its output through, capturing the last --tail bytes
 *   - POST <ping>/<exitCode> when it finishes, with that output as the body
 *   - exit with the command's own exit code
 */
export async function run(argv: string[]): Promise<number> {
  const args = parseRunArgs(argv);
  const pingUrl = resolvePingUrl({
    url: args.url,
    key: args.key,
    base: args.base,
  });

  if (args.start) {
    const r = await sendPing(`${pingUrl}/start`);
    if (!r.ok) warn(`start ping failed: ${r.error}`);
  }

  const tail = new TailBuffer(args.tailBytes);
  const startedAt = Date.now();

  const [cmd, ...rest] = args.command as [string, ...string[]];
  const child = spawn(cmd, rest, { stdio: ["inherit", "pipe", "pipe"] });

  child.stdout.on("data", (d: Buffer) => {
    process.stdout.write(d);
    tail.write(d);
  });
  child.stderr.on("data", (d: Buffer) => {
    process.stderr.write(d);
    tail.write(d);
  });

  const forward = (sig: NodeJS.Signals) => () => child.kill(sig);
  const onInt = forward("SIGINT");
  const onTerm = forward("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);

  const { code, signal } = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  }).catch((err: Error) => {
    warn(`could not start "${cmd}": ${err.message}`);
    return { code: 127, signal: null as NodeJS.Signals | null };
  });

  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);

  // Exit code: the child's, or 128+signal if it was killed by one.
  const exitCode =
    code != null ? code : signal ? 128 + (SIGNALS[signal] ?? 0) : 1;

  const durationMs = Date.now() - startedAt;
  const body =
    tail.toString() +
    `\n\n[illari] ${cmd} exited ${
      signal ? `on ${signal}` : `${exitCode}`
    } after ${(durationMs / 1000).toFixed(1)}s`;

  const r = await sendPing(`${pingUrl}/${exitCode}`, { body });
  if (!r.ok) warn(`completion ping failed: ${r.error}`);

  return exitCode;
}

function warn(msg: string): void {
  process.stderr.write(`illari: ${msg}\n`);
}

// Enough of the common ones for a sensible 128+n exit code.
const SIGNALS: Record<string, number> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGKILL: 9,
  SIGTERM: 15,
};
