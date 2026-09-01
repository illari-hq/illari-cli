import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import { importCrontab } from "../src/import.js";
import { UsageError } from "../src/resolve.js";

type Req = { path: string; auth: string | undefined; body: unknown };

async function withApi(
  handler: (body: { name: string }) => { status: number; json: unknown },
  fn: (base: string, reqs: Req[]) => Promise<void>,
): Promise<void> {
  const reqs: Req[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      reqs.push({ path: req.url ?? "", auth: req.headers.authorization, body });
      const { status, json } = handler(body);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  server.listen(0);
  await once(server, "listening");
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`, reqs);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const CRONTAB = `# backups
0 3 * * * /opt/bin/backup.sh
@daily /opt/bin/report.py
`;

test("--dry-run parses and creates nothing", async () => {
  await withApi(
    () => ({ status: 500, json: {} }),
    async (base, reqs) => {
      const code = await importCrontab(["--api", base, "--dry-run"].concat([writeTmp(CRONTAB)]));
      assert.equal(code, 0);
      assert.equal(reqs.length, 0);
    },
  );
});

test("creates a monitor per line with the right body + auth", async () => {
  await withApi(
    (b) => ({
      status: 201,
      json: { data: { pingKey: `key-for-${b.name}` } },
    }),
    async (base, reqs) => {
      const code = await importCrontab([
        "--api",
        base,
        "--token",
        "illari_" + "a".repeat(32),
        "--tz",
        "America/Chicago",
        writeTmp(CRONTAB),
      ]);
      assert.equal(code, 0);
      assert.equal(reqs.length, 2);
      assert.equal(reqs[0]!.path, "/monitors");
      assert.equal(reqs[0]!.auth, `Bearer illari_${"a".repeat(32)}`);
      assert.deepEqual(reqs[0]!.body, {
        name: "backup.sh",
        cronExpression: "0 3 * * *",
        timezone: "America/Chicago",
      });
      assert.deepEqual(reqs[1]!.body, {
        name: "report.py",
        cronExpression: "0 0 * * *",
        timezone: "America/Chicago",
      });
    },
  );
});

test("a failing create is reported and the run exits non-zero", async () => {
  await withApi(
    (b) =>
      b.name === "report.py"
        ? { status: 400, json: { error: "invalid cron expression" } }
        : { status: 201, json: { data: { pingKey: "k" } } },
    async (base, reqs) => {
      const code = await importCrontab([
        "--api",
        base,
        "--token",
        "illari_" + "b".repeat(32),
        writeTmp(CRONTAB),
      ]);
      assert.equal(code, 1);
      assert.equal(reqs.length, 2); // both attempted
    },
  );
});

test("--prefix is applied to names", async () => {
  await withApi(
    () => ({ status: 201, json: { data: { pingKey: "k" } } }),
    async (base, reqs) => {
      await importCrontab([
        "--api",
        base,
        "--token",
        "illari_" + "c".repeat(32),
        "--prefix",
        "prod/",
        writeTmp("0 1 * * * /x/job.sh"),
      ]);
      assert.equal((reqs[0]!.body as { name: string }).name, "prod/job.sh");
    },
  );
});

test("missing token (not dry-run) throws UsageError", async () => {
  await assert.rejects(
    () => importCrontab([writeTmp("0 1 * * * /x/job.sh")]),
    UsageError,
  );
});

test("malformed token throws UsageError", async () => {
  await assert.rejects(
    () => importCrontab(["--token", "nope", writeTmp("0 1 * * * /x/job.sh")]),
    UsageError,
  );
});

// --- helpers ---
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
let tmpDir: string | undefined;
function writeTmp(content: string): string {
  tmpDir ??= mkdtempSync(join(tmpdir(), "illari-import-"));
  const p = join(tmpDir, `crontab-${Math.random().toString(36).slice(2)}`);
  writeFileSync(p, content);
  return p;
}
