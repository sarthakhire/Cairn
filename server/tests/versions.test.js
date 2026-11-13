const test = require("node:test");
const assert = require("node:assert");
const { summarize, countChanges, short } = require("../src/services/versions");

const claim = (id, status, state, statement = "s " + id) => ({ id, status, statement, review: { state } });

test("summarize counts totals, verified, conflicts, missing and drafts", () => {
  const out = summarize([
    claim("c_001", "verified", "accepted"),
    claim("c_002", "conflicting", "draft"),
    claim("c_003", "conflicting", "rejected"),
    claim("c_004", "missing", "draft"),
    claim("c_005", "uncertain", "edited"),
  ]);
  assert.deepEqual(out, { total: 5, verified: 1, conflicts: 2, missing: 1, draft: 2 });
});

test("summarize of nothing is all zeros", () => {
  assert.deepEqual(summarize([]), { total: 0, verified: 0, conflicts: 0, missing: 0, draft: 0 });
});

test("countChanges counts edited, added and removed claims", () => {
  const snap = [claim("c_001", "verified", "accepted"), claim("c_002", "uncertain", "draft")];
  assert.equal(countChanges(snap, structuredClone(snap)), 0);

  const edited = structuredClone(snap);
  edited[1].statement = "changed";
  assert.equal(countChanges(snap, edited), 1);

  const added = [...structuredClone(snap), claim("c_003", "missing", "draft")];
  assert.equal(countChanges(snap, added), 1);

  assert.equal(countChanges(snap, [snap[0]]), 1); // c_002 removed
  assert.equal(countChanges([], []), 0);
});

test("short cuts at 80 characters and adds dots only when it cut", () => {
  assert.equal(short("a".repeat(80)), "a".repeat(80));
  assert.equal(short("a".repeat(81)), "a".repeat(80) + "...");
});
