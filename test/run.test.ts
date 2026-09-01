import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { run } from "../src/run.js";

type Hit = { path: string; body: string };

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

test("run: sends /start then /0 for a successful command", async () => {
  await withServer(async (base, hits) => {
    const code = await run([
      "--url",
      base,
      "--",
      process.execPath,
      "-e",
      "process.stdout.write('working\\n')",
    ]);
    assert.equal(code, 0);
    assert.deepEqual(
      hits.map((h) => h.path),
      ["/ping/testkey/start", "/ping/testkey/0"],
    );
    assert.match(hits[1]!.body, /working/);
    assert.match(hits[1]!.body, /\[illari\].*exited 0/);
  });
});

test("run: propagates a non-zero exit code and still pings", async () => {
  await withServer(async (base, hits) => {
    const code = await run([
      "--url",
      base,
      "--no-start",
      "--",
      process.execPath,
      "-e",
      "console.error('boom'); process.exit(3)",
    ]);
    assert.equal(code, 3);
    assert.deepEqual(
      hits.map((h) => h.path),
      ["/ping/testkey/3"],
    );
    assert.match(hits[0]!.body, /boom/);
  });
});

test("run: a missing binary exits 127 and pings /127", async () => {
  await withServer(async (base, hits) => {
    const code = await run([
      "--url",
      base,
      "--no-start",
      "--",
      "this-binary-does-not-exist-x9",
    ]);
    assert.equal(code, 127);
    assert.equal(hits.at(-1)?.path, "/ping/testkey/127");
  });
});

test("run: --tail caps the captured body", async () => {
  await withServer(async (base, hits) => {
    await run([
      "--url",
      base,
      "--no-start",
      "--tail",
      "20",
      "--",
      process.execPath,
      "-e",
      "process.stdout.write('x'.repeat(500))",
    ]);
    const body = hits.at(-1)!.body;
    const captured = body.split("\n\n[illari]")[0]!;
    assert.equal(captured.length, 20);
  });
});
