import { UsageError } from "./resolve.js";
import { resolvePingUrl } from "./resolve.js";
import { sendPing } from "./http.js";

/**
 * `illari ping [--key K | --url U] [--base B] [-d k=v ...] [start | <exit> | fail]`
 *
 * A one-shot check-in, for a crontab line or a quick manual test. The optional
 * trailing arg is the event suffix (`start`, a number, or `fail`). `-d k=v`
 * pairs are sent as metrics (illari keeps the numeric ones).
 */
export async function ping(argv: string[]): Promise<number> {
  let key: string | undefined;
  let url: string | undefined;
  let base: string | undefined;
  let suffix: string | undefined;
  const data: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok === "--key") key = req(argv[++i], "--key");
    else if (tok === "--url") url = req(argv[++i], "--url");
    else if (tok === "--base") base = req(argv[++i], "--base");
    else if (tok === "-d" || tok === "--data") {
      const pair = req(argv[++i], tok);
      if (!pair.includes("=")) {
        throw new UsageError(
          `${tok} expects key=value, got ${JSON.stringify(pair)}`,
        );
      }
      data.push(pair);
    } else if (tok.startsWith("-")) {
      throw new UsageError(`unknown option ${tok}`);
    } else if (suffix === undefined) suffix = tok;
    else throw new UsageError(`unexpected argument ${JSON.stringify(tok)}`);
  }

  if (suffix !== undefined && !/^(start|fail|\d{1,3})$/.test(suffix)) {
    throw new UsageError(
      `event must be "start", "fail", or an exit code 0-255, got ${JSON.stringify(suffix)}`,
    );
  }

  let target = resolvePingUrl({ url, key, base });
  if (suffix !== undefined) target = `${target}/${suffix}`;

  let body: string | undefined;
  let contentType: string | undefined;
  if (data.length) {
    const params = new URLSearchParams();
    for (const pair of data) {
      const eq = pair.indexOf("=");
      params.append(pair.slice(0, eq), pair.slice(eq + 1));
    }
    body = params.toString();
    contentType = "application/x-www-form-urlencoded";
  }

  const r = await sendPing(target, { body, contentType });
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
