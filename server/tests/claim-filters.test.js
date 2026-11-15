// Pure tests for step S2.4: no database, no HTTP.
const test = require("node:test");
const assert = require("node:assert");
const { parseClaimQuery, applyClaimFilters, MAX_Q, MAX_VALUES } = require("../src/services/claimFilters");

const claim = (id, o = {}) => ({
  id, type: "decision", statement: "Statement " + id, status: "uncertain", visibility: "team",
  verification: "verified", review: { state: "draft" }, ...o,
});

const CLAIMS = [
  claim("c_002", { review: { state: "accepted" }, type: "risk_dependency", status: "verified" }),
  claim("c_010", { review: { state: "draft" }, verification: "mismatch", statement: "Deploys freeze on Friday" }),
  claim("c_001", { review: { state: "rejected" }, verification: "partial", visibility: "lead_only" }),
  claim("c_003", { review: { state: "edited" }, type: "open_question", status: "missing", verification: "none" }),
];
const ids = (list) => list.map((c) => c.id);
const run = (query) => {
  const parsed = parseClaimQuery(query);
  assert.ok(parsed.ok, parsed.error);
  return applyClaimFilters(CLAIMS, parsed.filters);
};

test("no filters keeps every claim in the original order", () => {
  assert.deepEqual(ids(run({})), ["c_002", "c_010", "c_001", "c_003"]);
});

test("unknown parameter names and empty values are ignored", () => {
  assert.deepEqual(ids(run({ _: "123", as: "incoming_developer", review: "", q: "   ", sort: "" })), ["c_002", "c_010", "c_001", "c_003"]);
});

test("each list filter selects the right claims", () => {
  assert.deepEqual(ids(run({ review: "draft" })), ["c_010"]);
  assert.deepEqual(ids(run({ type: "open_question" })), ["c_003"]);
  assert.deepEqual(ids(run({ status: "verified" })), ["c_002"]);
  assert.deepEqual(ids(run({ visibility: "lead_only" })), ["c_001"]);
  assert.deepEqual(ids(run({ verification: "mismatch" })), ["c_010"]);
});

test("several values: comma list and repeated parameter both mean OR", () => {
  assert.deepEqual(ids(run({ review: "draft,rejected" })), ["c_010", "c_001"]);
  assert.deepEqual(ids(run({ review: ["draft", "rejected"] })), ["c_010", "c_001"]);
  assert.deepEqual(ids(run({ review: " draft , draft " })), ["c_010"]);
});

test("different filters combine with AND", () => {
  assert.deepEqual(ids(run({ review: "draft,accepted", type: "decision" })), ["c_010"]);
  assert.deepEqual(ids(run({ review: "accepted", type: "decision" })), []);
});

test("q is a case-insensitive substring of the statement or the id", () => {
  assert.deepEqual(ids(run({ q: "FREEZE" })), ["c_010"]);
  assert.deepEqual(ids(run({ q: "c_00" })), ["c_002", "c_001", "c_003"]);
  assert.deepEqual(ids(run({ q: "nothing like this" })), []);
});

test("sort by id is numeric, not alphabetical", () => {
  assert.deepEqual(ids(run({ sort: "id" })), ["c_001", "c_002", "c_003", "c_010"]);
  assert.deepEqual(ids(run({ sort: "-id" })), ["c_010", "c_003", "c_002", "c_001"]);
});

test("applyClaimFilters never changes the input list", () => {
  const copy = ids(CLAIMS);
  applyClaimFilters(CLAIMS, { sort: "-id" });
  assert.deepEqual(ids(CLAIMS), copy);
});

test("a claim with no verification field counts as none", () => {
  const masked = { id: "c_050", type: "decision", statement: "Restricted: request access from reviewer", status: "uncertain", visibility: "restricted", review: { state: "accepted" } };
  const f = parseClaimQuery({ verification: "none" }).filters;
  assert.deepEqual(ids(applyClaimFilters([masked], f)), ["c_050"]);
  const g = parseClaimQuery({ verification: "mismatch" }).filters;
  assert.deepEqual(ids(applyClaimFilters([masked], g)), []);
});

test("bad values are rejected with a readable message", () => {
  const bad = [
    { review: "bogus" }, { review: "draft,bogus" }, { type: "nope" }, { status: "x" },
    { visibility: "public" }, { verification: "great" }, { sort: "name" }, { sort: ["id", "-id"] },
    { q: "a".repeat(MAX_Q + 1) }, { q: ["a", "b"] },
    { review: ["draft", "accepted", "edited", "rejected", "draft", "draft", "draft", "draft", "draft", "draft", "x"].join(",") },
  ];
  for (const q of bad) {
    const parsed = parseClaimQuery(q);
    assert.equal(parsed.ok, false, JSON.stringify(q));
    assert.equal(typeof parsed.error, "string");
    assert.ok(parsed.error.length > 0 && parsed.error.length < 200);
  }
});

test("values are case sensitive and a long bad value is cut in the message", () => {
  assert.equal(parseClaimQuery({ review: "Draft" }).ok, false);
  const parsed = parseClaimQuery({ type: "x".repeat(500) });
  assert.equal(parsed.ok, false);
  assert.ok(parsed.error.length < 200);
});

test("too many values is rejected", () => {
  const many = Array(MAX_VALUES + 1).fill("draft").join(",");
  assert.equal(parseClaimQuery({ review: many }).ok, false);
  const fine = Array(MAX_VALUES).fill("draft").join(",");
  assert.equal(parseClaimQuery({ review: fine }).ok, true);
});

test("odd input does not crash", () => {
  for (const q of [undefined, null, {}, { review: undefined }, { review: {} }, { q: {} }, { sort: 5 }]) {
    assert.doesNotThrow(() => parseClaimQuery(q === null ? undefined : q));
  }
});