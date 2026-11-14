const test = require("node:test");
const assert = require("node:assert");
const { serializeClaim, claimVerification } = require("../src/services/serializer");

const chunkId = {
  n: 1,
  timestamp: "2026-03-02T10:00:00Z",
  sourceId: { name: "notes.md", createdAt: "2026-03-01T00:00:00Z" },
};
const ev = (extra = {}) => ({
  chunkId,
  quote: "q".repeat(20),
  quoteFound: true,
  supportsStatement: true,
  ...extra,
});
const withMatch = (result) => ({
  match: { result, score: 0.9, method: "fuzzy", reason: null, closest: null },
});

test("no evidence gives none", () => {
  assert.equal(claimVerification([]), "none");
  assert.equal(claimVerification(undefined), "none");
  assert.equal(claimVerification(null), "none");
});

test("rollup is the best result across the evidence", () => {
  const r = (...results) => claimVerification(results.map((x) => ev(withMatch(x))));
  assert.equal(r("mismatch"), "mismatch");
  assert.equal(r("partial"), "partial");
  assert.equal(r("verified"), "verified");
  assert.equal(r("mismatch", "partial"), "partial");
  assert.equal(r("mismatch", "verified", "partial"), "verified");
});

test("legacy evidence without match is derived from the old flags", () => {
  const v = (flags) => claimVerification([ev(flags)]);
  assert.equal(v({ quoteFound: true, supportsStatement: true }), "verified");
  assert.equal(v({ quoteFound: true, supportsStatement: null }), "partial");
  assert.equal(v({ quoteFound: true, supportsStatement: false }), "mismatch");
  assert.equal(v({ quoteFound: false, supportsStatement: null }), "mismatch");
});

test("a stored match wins over the legacy flags", () => {
  assert.equal(claimVerification([ev({ quoteFound: false, ...withMatch("verified") })]), "verified");
});

test("serializeClaim outputs verification and a five-field match on every evidence item", () => {
  const stored = {
    claimId: "c_900",
    type: "decision",
    statement: "Postgres chosen",
    status: "verified",
    visibility: "team",
    evidence: [ev(), ev({ quoteFound: false, supportsStatement: null })],
    review: { state: "draft" },
  };
  const out = serializeClaim(stored);
  assert.equal(out.verification, "verified");
  assert.equal(out.evidence.length, 2);
  for (const e of out.evidence) {
    assert.deepEqual(Object.keys(e.match).sort(), ["closest", "method", "reason", "result", "score"]);
  }
  assert.equal(out.evidence[0].match.result, "verified");
  assert.equal(out.evidence[1].match.result, "mismatch");
});

test("a claim with no evidence serialises with verification none", () => {
  const out = serializeClaim({ claimId: "c_901", type: "open_question", statement: "Who owns billing?", status: "missing", visibility: "team", evidence: [], review: {} });
  assert.equal(out.verification, "none");
  assert.deepEqual(out.evidence, []);
});