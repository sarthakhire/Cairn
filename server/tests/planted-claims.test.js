const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const entries = require("../seed-data/planted-claims.json");
const { gradeEntry } = require("../scripts/seed-planted");
const { serializeClaim } = require("../src/services/serializer");

// Same cut as the notes importer: one chunk per heading section, numbered from 1,
// heading line included, front matter dropped. Kept local so this test needs no database.
function chunksOf(file) {
  const raw = fs
    .readFileSync(path.join(__dirname, "..", "..", "data", file), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
  return body.split(/^(?=#{1,6} )/m).map((s) => s.trim()).filter(Boolean);
}
const chunkText = (e) => chunksOf(e.source)[e.chunk - 1];

test("chunk numbering used here matches the real data (Frontend is chunk 4)", () => {
  assert.ok(chunksOf("meeting-notes-01.md")[3].includes("frontend will be React with Vite"));
});

for (const entry of entries) {
  test(`planted claim '${entry.id}' gets its expected result from the real matcher`, () => {
    const text = chunkText(entry);
    assert.ok(text, `chunk ${entry.chunk} of ${entry.source} must exist`);
    const { match, quoteFound } = gradeEntry(entry, text);
    assert.equal(match.result, entry.expect.result, JSON.stringify(match));
    assert.equal(match.method, entry.expect.method, JSON.stringify(match));
    assert.ok(String(match.reason).includes(entry.expect.reason), JSON.stringify(match));
    assert.equal(quoteFound, false); // none of the planted quotes is an exact match
  });
}

test("no planted claim can ever be verified", () => {
  for (const entry of entries) {
    assert.notEqual(gradeEntry(entry, chunkText(entry)).match.result, "verified");
  }
});

test("planted ids are unique and every entry has the fields the seed needs", () => {
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  for (const e of entries) {
    for (const k of ["id", "type", "statement", "source", "chunk", "quote", "expect"]) assert.ok(e[k] !== undefined, `${e.id} lacks ${k}`);
  }
});

test("the planted flag is never serialised to the API", () => {
  const out = serializeClaim({
    claimId: "c_900", type: "decision", statement: "x", status: "uncertain", visibility: "team",
    evidence: [], review: { state: "draft" }, planted: true,
  });
  assert.ok(!("planted" in out));
  assert.ok(!JSON.stringify(out).includes("planted"));
});