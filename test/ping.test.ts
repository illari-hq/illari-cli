import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import { ping } from "../src/ping.js";
import { UsageError } from "../src/resolve.js";

type Hit = { path: string; contentType: string | undefined; body: string };

async function withServer(
  fn: (base: string, hits: Hit[]) => Promise<void>,
): Promise<void> {
  const hits: Hit[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      hits.push({
        path: req.url ?? "",
        contentType: req.headers["content-type"],
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200).end();
    });
  });
  server.listen(0);
  await once(server, "listening");
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}/ping/testkey`, hits);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("bare ping sends no body", async () => {
  await withServer(async (url, hits) => {
    const code = await ping(["--url", url]);
    assert.equal(code, 0);
    assert.equal(hits[0]!.body, "");
  });
});

test("-d pairs are sent as a form-encoded body", async () => {
  await withServer(async (url, hits) => {
    const code = await ping([
      "--url",
      url,
      "-d",
      "rows=42",
      "--data",
      "cost_usd=1.25",
      "0",
    ]);
    assert.equal(code, 0);
    assert.equal(hits[0]!.path, "/ping/testkey/0");
    assert.equal(hits[0]!.contentType, "application/x-www-form-urlencoded");
    const params = new URLSearchParams(hits[0]!.body);
    assert.equal(params.get("rows"), "42");
    assert.equal(params.get("cost_usd"), "1.25");
  });
});

test("-d without = is a UsageError", async () => {
  await assert.rejects(
    () => ping(["--url", "https://x.test/ping/k", "-d", "rows"]),
    UsageError,
  );
});

test("event suffix still validated alongside -d", async () => {
  await assert.rejects(
    () => ping(["--url", "https://x.test/ping/k", "-d", "n=1", "bogus"]),
    UsageError,
  );
});
