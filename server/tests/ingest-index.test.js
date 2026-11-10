const test = require("node:test");
const assert = require("node:assert");
const { parseSource, kindFromFilename, IngestError } = require("../src/services/ingest");

test("file kind comes from the extension, case-insensitive", () => {
  assert.equal(kindFromFilename("a.md"), "notes");
  assert.equal(kindFromFilename("A.JSON"), "github");
  assert.equal(kindFromFilename("t.csv"), "tasks");
  assert.equal(kindFromFilename("a.pdf"), null);
  assert.equal(kindFromFilename("noext"), null);
});

test("parseSource dispatches to the right importer", () => {
  const notes = parseSource("a.md", "## A\nbody");
  assert.equal(notes.kind, "notes");
  assert.equal(notes.chunks[0].ref, "a.md#1");
  const gh = parseSource("a.json", JSON.stringify({ issues: [{ number: 1, title: "t", body: "b" }] }));
  assert.equal(gh.kind, "github");
});

test("unsupported types throw IngestError", () => {
  assert.throws(() => parseSource("a.pdf", "x"), IngestError);
});