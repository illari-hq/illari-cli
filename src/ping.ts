import { UsageError } from "./resolve.js";
import { resolvePingUrl } from "./resolve.js";
import { sendPing } from "./http.js";

/**
 * `illari ping [--key K | --url U] [--base B] [/start | /<exit> | /fail]`
 *
 * A one-shot check-in, for a crontab line or a quick manual test. The optional
 * trailing arg is the event suffix (`start`, a number, or `fail`).
 */
export async function ping(argv: string[]): Promise<number> {
  let key: string | undefined;
  let url: string | undefined;
  let base: string | undefined;
  let suffix: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok === "--key") key = req(argv[++i], "--key");
    else if (tok === "--url") url = req(argv[++i], "--url");
    else if (tok === "--base") base = req(argv[++i], "--base");
    else if (tok.startsWith("--")) throw new UsageError(`unknown option ${tok}`);
    else if (suffix === undefined) suffix = tok;
    else throw new UsageError(`unexpected argument ${JSON.stringify(tok)}`);
  }

  if (suffix !== undefined && !/^(start|fail|\d{1,3})$/.test(suffix)) {
    throw new UsageError(
      `event must be "start", "fail", or an exit code 0-255, got ${JSON.stringify(suffix)}`,
    );
  }

  let target = resolvePingUrl({ url, key, base });
  if (suffix !== undefined) target = `${target}/${suffix}`;

  const r = await sendPing(target);
  if (!r.ok) {
    process.stderr.write(`illari: ping failed: ${r.error}\n`);
    return 1;
  }
  return 0;
}

function req(v: string | undefined, name: string): string {
  if (v === undefined) throw new UsageError(`${name} needs a value`);
  return v;
}
