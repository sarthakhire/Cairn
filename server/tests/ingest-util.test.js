const test = require("node:test");
const assert = require("node:assert");
const { parseDate, splitLong, pushChunks, MAX_CHUNK_CHARS } = require("../src/services/ingest/util");

test("parseDate accepts ISO dates and date-times", () => {
  assert.equal(parseDate("2026-02-03").toISOString(), "2026-02-03T00:00:00.000Z");
  assert.equal(parseDate("2026-02-03T10:15:00Z").toISOString(), "2026-02-03T10:15:00.000Z");
});

test("parseDate treats a date-time with no zone as UTC", () => {
  assert.equal(parseDate("2026-02-03 10:15").toISOString(), "2026-02-03T10:15:00.000Z");
  assert.equal(parseDate("2026-02-03T10:15:30").toISOString(), "2026-02-03T10:15:30.000Z");
});

test("parseDate returns null for anything else", () => {
  for (const bad of [null, undefined, "", "soon", "03/02/2026", "3 Feb 2026", "2026-13-45", 12345]) {
    assert.equal(parseDate(bad), null, String(bad));
  }
});

test("splitLong keeps short text whole and drops empty text", () => {
  assert.deepEqual(splitLong("  hello  "), ["hello"]);
  assert.deepEqual(splitLong("   "), []);
});

test("splitLong splits on paragraphs and respects the limit", () => {
  const para = "word ".repeat(100).trim(); // 499 chars
  const text = [para, para, para, para].join("\n\n");
  const parts = splitLong(text, 1100);
  assert.ok(parts.length >= 2);
  for (const p of parts) assert.ok(p.length <= 1100, "chunk too long: " + p.length);
  assert.equal(parts.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
});

test("splitLong cuts a single huge paragraph", () => {
  const text = "abcdefghij ".repeat(500); // one paragraph, no blank lines
  const parts = splitLong(text, 1000);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 1000);
});

test("splitLong cuts text with no spaces at the limit", () => {
  const parts = splitLong("x".repeat(2500), 1000);
  assert.deepEqual(parts.map((p) => p.length), [1000, 1000, 500]);
});

test("pushChunks numbers chunks from 1 and builds ref from the file name", () => {
  const chunks = [];
  pushChunks(chunks, "a.md", "first", { author: "x" });
  pushChunks(chunks, "a.md", "second");
  assert.deepEqual(chunks.map((c) => [c.n, c.ref]), [[1, "a.md#1"], [2, "a.md#2"]]);
  assert.equal(chunks[0].author, "x");
  assert.equal(chunks[1].author, null);
  assert.equal(chunks[1].timestamp, null);
  assert.equal(chunks[1].link, null);
});

test("MAX_CHUNK_CHARS is a sensible size", () => {
  assert.ok(MAX_CHUNK_CHARS >= 1000 && MAX_CHUNK_CHARS <= 8000);
});