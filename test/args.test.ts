import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRunArgs } from "../src/args.js";
import { UsageError } from "../src/resolve.js";

test("plain command after options", () => {
  const a = parseRunArgs(["--key", "k", "./job.sh", "--verbose"]);
  assert.equal(a.key, "k");
  assert.deepEqual(a.command, ["./job.sh", "--verbose"]);
  assert.equal(a.start, true);
  assert.equal(a.tailBytes, 10_000);
});

test("-- separates options from a command that starts with a dash", () => {
  const a = parseRunArgs(["--key", "k", "--", "--weird-binary", "-x"]);
  assert.deepEqual(a.command, ["--weird-binary", "-x"]);
});

test("--opt=value form", () => {
  const a = parseRunArgs(["--key=abc", "--tail=50", "--no-start", "run.sh"]);
  assert.equal(a.key, "abc");
  assert.equal(a.tailBytes, 50);
  assert.equal(a.start, false);
  assert.deepEqual(a.command, ["run.sh"]);
});

test("url and base pass through", () => {
  const a = parseRunArgs(["--url", "https://x/y", "--base", "https://b", "c"]);
  assert.equal(a.url, "https://x/y");
  assert.equal(a.base, "https://b");
});

test("missing command throws", () => {
  assert.throws(() => parseRunArgs(["--key", "k"]), UsageError);
  assert.throws(() => parseRunArgs(["--key", "k", "--"]), UsageError);
});

test("unknown option throws", () => {
  assert.throws(() => parseRunArgs(["--nope", "x"]), UsageError);
});

test("--tail must be a non-negative integer", () => {
  assert.throws(() => parseRunArgs(["--tail", "-1", "x"]), UsageError);
  assert.throws(() => parseRunArgs(["--tail", "abc", "x"]), UsageError);
});

test("flag with no value throws", () => {
  assert.throws(() => parseRunArgs(["--key"]), UsageError);
});
