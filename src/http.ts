/**
 * Send one ping, with retries. A monitoring ping should not fail a job, so
 * everything here is best-effort: on a hard failure we warn and move on.
 */

export type PingResult =
  | { ok: true; status: number }
  | { ok: false; status?: number; error: string };

export type SendOptions = {
  body?: string | undefined;
  timeoutMs?: number;
  retries?: number;
  /** injectable for tests */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function sendPing(
  url: string,
  opts: SendOptions = {},
): Promise<PingResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? sleepReal;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const retries = opts.retries ?? 3;

  let last: PingResult = { ok: false, error: "not attempted" };

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        method: "POST",
        signal: ac.signal,
        ...(opts.body != null
          ? { body: opts.body, headers: { "content-type": "text/plain" } }
          : {}),
      });
      if (res.ok) return { ok: true, status: res.status };
      // 4xx is a client problem (bad key, rate limit); retrying won't help
      // except for 429, which we still skip — a job shouldn't stall on it.
      if (res.status < 500) {
        return { ok: false, status: res.status, error: `HTTP ${res.status}` };
      }
      last = { ok: false, status: res.status, error: `HTTP ${res.status}` };
    } catch (err) {
      last = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return last;
}
