import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import { effectiveStatus, list, relative } from "../src/list.js";
import { UsageError } from "../src/resolve.js";

async function withApi(
  respond: (req: { path: string; auth: string | undefined }) => {
    status: number;
    json: unknown;
  },
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const { status, json } = respond({
        path: req.url ?? "",
        auth: req.headers.authorization,
      });
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  server.listen(0);
  await once(server, "listening");
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const TOKEN = "illari_" + "a".repeat(32);

function capture(fn: () => Promise<number>) {
  const out: string[] = [];
  const w = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((s: string) => {
    out.push(String(s));
    return true;
  }) as typeof process.stdout.write;
  return fn().then((code) => {
    process.stdout.write = w;
    return { code, out: out.join("") };
  });
}

test("renders a table of monitors", async () => {
  await withApi(
    (req) => {
      assert.equal(req.path, "/monitors");
      assert.equal(req.auth, `Bearer ${TOKEN}`);
      return {
        status: 200,
        json: {
          data: [
            {
              name: "nightly-etl",
              status: "up",
              paused: false,
              snoozedUntil: null,
              lastPingAt: new Date(Date.now() - 4 * 60_000).toISOString(),
              cronExpression: "0 2 * * *",
              timezone: "America/Chicago",
            },
            {
              name: "backup",
              status: "down",
              paused: false,
              snoozedUntil: null,
              lastPingAt: null,
              cronExpression: null,
              timezone: "UTC",
            },
          ],
        },
      };
    },
    async (base) => {
      const { code, out } = await capture(() =>
        list(["--api", base, "--token", TOKEN]),
      );
      assert.equal(code, 0);
      assert.match(out, /NAME\s+STATUS\s+LAST CHECK-IN\s+SCHEDULE/);
      assert.match(out, /nightly-etl\s+up\s+4m ago\s+0 2 \* \* \* \(America\/Chicago\)/);
      assert.match(out, /backup\s+down\s+never\s+no fixed schedule/);
    },
  );
});

test("empty account prints a friendly line", async () => {
  await withApi(
    () => ({ status: 200, json: { data: [] } }),
    async (base) => {
      const { code, out } = await capture(() =>
        list(["--api", base, "--token", TOKEN]),
      );
      assert.equal(code, 0);
      assert.match(out, /No monitors/);
    },
  );
});

test("a 401 is reported and exits 1", async () => {
  await withApi(
    () => ({ status: 401, json: { error: "invalid or revoked API key" } }),
    async (base) => {
      const { code } = await capture(() =>
        list(["--api", base, "--token", TOKEN]),
      );
      assert.equal(code, 1);
    },
  );
});

test("missing token throws UsageError", async () => {
  await assert.rejects(() => list([]), UsageError);
});

test("effectiveStatus: paused / snoozed / plain", () => {
  assert.equal(
    effectiveStatus({ status: "up", paused: true, snoozedUntil: null }),
    "paused",
  );
  assert.equal(
    effectiveStatus({
      status: "up",
      paused: false,
      snoozedUntil: new Date(Date.now() + 60_000).toISOString(),
    }),
    "snoozed",
  );
  assert.equal(
    effectiveStatus({
      status: "late",
      paused: false,
      snoozedUntil: new Date(Date.now() - 60_000).toISOString(),
    }),
    "late",
  );
});

test("relative time buckets", () => {
  const now = Date.parse("2026-09-01T12:00:00Z");
  assert.equal(relative("2026-09-01T11:59:40Z", now), "just now");
  assert.equal(relative("2026-09-01T11:45:00Z", now), "15m ago");
  assert.equal(relative("2026-09-01T09:00:00Z", now), "3h ago");
  assert.equal(relative("2026-08-29T12:00:00Z", now), "3d ago");
});
