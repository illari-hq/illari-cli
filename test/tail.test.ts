import assert from "node:assert/strict";
import { test } from "node:test";
import { TailBuffer } from "../src/tail.js";

test("keeps everything under the limit", () => {
  const t = new TailBuffer(100);
  t.write("hello ");
  t.write("world");
  assert.equal(t.toString(), "hello world");
});

test("drops the oldest bytes past the limit", () => {
  const t = new TailBuffer(5);
  t.write("abcdefghij");
  assert.equal(t.toString(), "fghij");
});

test("trims across chunk boundaries", () => {
  const t = new TailBuffer(4);
  t.write("abc");
  t.write("de");
  t.write("fg");
  assert.equal(t.toString(), "defg");
});

test("a single oversized write is sliced", () => {
  const t = new TailBuffer(3);
  t.write(Buffer.from("0123456789"));
  assert.equal(t.toString(), "789");
});

test("limit 0 captures nothing", () => {
  const t = new TailBuffer(0);
  t.write("anything");
  assert.equal(t.toString(), "");
});
