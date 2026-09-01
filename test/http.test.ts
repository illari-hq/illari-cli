import assert from "node:assert/strict";
import { test } from "node:test";
import { sendPing } from "../src/http.js";

const noSleep = () => Promise.resolve();

function fetchReturning(statuses: number[]): {
  impl: typeof fetch;
  calls: () => number;
} {
  let i = 0;
  const impl = (async () => {
    const status = statuses[Math.min(i, statuses.length - 1)]!;
    i++;
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { impl, calls: () => i };
}

test("2xx succeeds on the first try", async () => {
  const f = fetchReturning([200]);
  const r = await sendPing("https://x/k", { fetchImpl: f.impl, sleep: noSleep });
  assert.deepEqual(r, { ok: true, status: 200 });
  assert.equal(f.calls(), 1);
});

test("404 fails without retrying", async () => {
  const f = fetchReturning([404]);
  const r = await sendPing("https://x/k", { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(f.calls(), 1);
});

test("5xx is retried, then gives up", async () => {
  const f = fetchReturning([500]);
  const r = await sendPing("https://x/k", {
    fetchImpl: f.impl,
    sleep: noSleep,
    retries: 2,
  });
  assert.equal(r.ok, false);
  assert.equal(f.calls(), 3); // 1 + 2 retries
});

test("recovers if a later attempt succeeds", async () => {
  const f = fetchReturning([503, 503, 200]);
  const r = await sendPing("https://x/k", {
    fetchImpl: f.impl,
    sleep: noSleep,
    retries: 3,
  });
  assert.deepEqual(r, { ok: true, status: 200 });
  assert.equal(f.calls(), 3);
});

test("network errors are retried", async () => {
  let calls = 0;
  const impl = (async () => {
    calls++;
    if (calls < 3) throw new Error("ECONNREFUSED");
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const r = await sendPing("https://x/k", {
    fetchImpl: impl,
    sleep: noSleep,
    retries: 3,
  });
  assert.equal(r.ok, true);
  assert.equal(calls, 3);
});

test("sends the body with a text content-type", async () => {
  let seen: RequestInit | undefined;
  const impl = (async (_url: string, init: RequestInit) => {
    seen = init;
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  await sendPing("https://x/k", {
    body: "tail output",
    fetchImpl: impl,
    sleep: noSleep,
  });
  assert.equal(seen?.body, "tail output");
  assert.deepEqual(seen?.headers, { "content-type": "text/plain" });
});
