/**
 * Work out which URL to ping.
 *
 * Priority:
 *   1. --url <full ping URL>            or  ILLARI_URL
 *   2. --key <key> (joined onto base)   or  ILLARI_KEY
 * Base for (2): --base, else ILLARI_BASE, else https://illari.dev/ping
 */

export const DEFAULT_BASE = "https://illari.dev/ping";

export type ResolveInput = {
  url?: string | undefined;
  key?: string | undefined;
  base?: string | undefined;
  env?: NodeJS.ProcessEnv;
};

export function resolvePingUrl(input: ResolveInput): string {
  const env = input.env ?? process.env;

  const url = input.url ?? env.ILLARI_URL;
  if (url) {
    assertHttp(url);
    return stripTrailingSlash(url);
  }

  const key = input.key ?? env.ILLARI_KEY;
  if (!key) {
    throw new UsageError(
      "no monitor given. Pass --key <key> or --url <url>, or set ILLARI_KEY / ILLARI_URL.",
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new UsageError(`--key looks wrong: ${JSON.stringify(key)}`);
  }

  const base = stripTrailingSlash(input.base ?? env.ILLARI_BASE ?? DEFAULT_BASE);
  assertHttp(base);
  return `${base}/${key}`;
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function assertHttp(u: string): void {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new UsageError(`not a URL: ${JSON.stringify(u)}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UsageError(`URL must be http(s): ${JSON.stringify(u)}`);
  }
}

/** A user mistake — printed without a stack trace, exit code 2. */
export class UsageError extends Error {}
