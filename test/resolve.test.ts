import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BASE, resolvePingUrl, UsageError } from "../src/resolve.js";

const noEnv: NodeJS.ProcessEnv = {};

test("--key joins onto the default base", () => {
  assert.equal(
    resolvePingUrl({ key: "abc123", env: noEnv }),
    `${DEFAULT_BASE}/abc123`,
  );
});

test("--url wins over --key and is used as-is (trailing slash trimmed)", () => {
  assert.equal(
    resolvePingUrl({ url: "https://x.test/ping/k/", key: "abc", env: noEnv }),
    "https://x.test/ping/k",
  );
});

test("--base overrides the default", () => {
  assert.equal(
    resolvePingUrl({ key: "k", base: "http://localhost:9000/ping/", env: noEnv }),
    "http://localhost:9000/ping/k",
  );
});

test("env fallbacks: ILLARI_URL, then ILLARI_KEY + ILLARI_BASE", () => {
  assert.equal(
    resolvePingUrl({ env: { ILLARI_URL: "https://e.test/p/k" } }),
    "https://e.test/p/k",
  );
  assert.equal(
    resolvePingUrl({
      env: { ILLARI_KEY: "k", ILLARI_BASE: "https://e.test/p" },
    }),
    "https://e.test/p/k",
  );
});

test("no key and no url is a UsageError", () => {
  assert.throws(() => resolvePingUrl({ env: noEnv }), UsageError);
});

test("a bad key shape is rejected", () => {
  assert.throws(() => resolvePingUrl({ key: "has spaces", env: noEnv }), UsageError);
});

test("a non-http url is rejected", () => {
  assert.throws(
    () => resolvePingUrl({ url: "ftp://x.test/k", env: noEnv }),
    UsageError,
  );
});
