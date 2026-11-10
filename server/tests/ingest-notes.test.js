const test = require("node:test");
const assert = require("node:assert");
const { parseNotes, parseFrontMatter } = require("../src/services/ingest/notes");
const { verifyQuote } = require("../src/services/verify");

test("one chunk per heading section, numbered from 1, ref = filename#n", () => {
  const md = "## A\nalpha text\n\n## B\nbeta text\n\n## C\ngamma text";
  const chunks = parseNotes(md, "n.md");
  assert.deepEqual(chunks.map((c) => c.ref), ["n.md#1", "n.md#2", "n.md#3"]);
  assert.deepEqual(chunks.map((c) => c.n), [1, 2, 3]);
});

test("the heading line is part of the chunk text", () => {
  const [c] = parseNotes("## Database\nDecision: Postgres", "n.md");
  assert.match(c.text, /^## Database\nDecision: Postgres$/);
});

test("text before the first heading becomes its own chunk", () => {
  const chunks = parseNotes("intro line\n\n## A\nbody", "n.md");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].text, "intro line");
});

test("a heading with no body is skipped and does not use up a number", () => {
  const chunks = parseNotes("# Title\n\n## A\nbody a\n\n## B\n\n## C\nbody c", "n.md");
  assert.deepEqual(chunks.map((c) => c.text.split("\n")[0]), ["## A", "## C"]);
  assert.deepEqual(chunks.map((c) => c.n), [1, 2]);
});

test("front matter gives date and author to every chunk and is not part of the text", () => {
  const md = "---\ndate: 2026-02-03\nauthor: Meera\n---\n\n## A\nbody";
  const [c] = parseNotes(md, "n.md");
  assert.equal(c.timestamp.toISOString(), "2026-02-03T00:00:00.000Z");
  assert.equal(c.author, "Meera");
  assert.ok(!c.text.includes("date:"));
  assert.ok(!c.text.includes("---"));
});

test("a date in a heading overrides the front-matter date", () => {
  const md = "---\ndate: 2026-02-01\n---\n## 2026-02-21 #general\nhello there\n\n## Later\nno date here";
  const chunks = parseNotes(md, "n.md");
  assert.equal(chunks[0].timestamp.toISOString().slice(0, 10), "2026-02-21");
  assert.equal(chunks[1].timestamp.toISOString().slice(0, 10), "2026-02-01");
});

test("no date anywhere gives a null timestamp, an invalid date is ignored", () => {
  assert.equal(parseNotes("## A\nbody", "n.md")[0].timestamp, null);
  assert.equal(parseNotes("---\ndate: soon\n---\n## A\nbody", "n.md")[0].timestamp, null);
});

test("# lines inside code fences are not headings", () => {
  const md = "## Setup\nRun this:\n\n```bash\n# install deps\nnpm i\n```\n\nDone.\n\n## Next\nmore";
  const chunks = parseNotes(md, "n.md");
  assert.equal(chunks.length, 2);
  assert.match(chunks[0].text, /# install deps/);
});

test("Windows line endings and a BOM are handled", () => {
  const md = "\uFEFF---\r\ndate: 2026-02-03\r\n---\r\n## A\r\nalpha\r\n\r\n## B\r\nbeta\r\n";
  const chunks = parseNotes(md, "n.md");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].timestamp.toISOString().slice(0, 10), "2026-02-03");
});

test("empty or whitespace-only files give no chunks", () => {
  assert.deepEqual(parseNotes("", "n.md"), []);
  assert.deepEqual(parseNotes("  \n\n ", "n.md"), []);
});

test("a very long section is split into several chunks with the same metadata", () => {
  const para = "lorem ipsum dolor sit amet ".repeat(60).trim();
  const md = "---\ndate: 2026-02-03\n---\n## Long\n" + [para, para, para, para].join("\n\n");
  const chunks = parseNotes(md, "n.md");
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.text.length <= 3000);
    assert.equal(c.timestamp.toISOString().slice(0, 10), "2026-02-03");
  }
  assert.deepEqual(chunks.map((c) => c.n), chunks.map((_, i) => i + 1));
});

test("quotes taken from the notes verify against their chunk", () => {
  const [c] = parseNotes("## Database\nDecision: going with Postgres, the reporting queries need joins.", "n.md");
  assert.ok(verifyQuote("...going with Postgres, the reporting queries need joins...", c.text));
});

test("parseFrontMatter ignores unknown keys and strips quotes", () => {
  const { meta, body } = parseFrontMatter('---\ntitle: x\nauthor: "Meera"\n---\nrest');
  assert.equal(meta.author, "Meera");
  assert.equal(body, "rest");
});