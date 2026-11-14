const test = require("node:test");
const assert = require("node:assert");
const { viewClaim } = require("../src/services/permissions");

const SENTINEL = "SENTINEL_CLOSEST_TEXT_9f3a";
const claim = (visibility, state = "accepted") => ({
  id: "c_1",
  type: "decision",
  statement: "Postgres chosen",
  status: "uncertain",
  verification: "partial",
  evidence: [
    {
      quote: "...Team agreed on Postgres...",
      source: "a.md",
      chunk: 1,
      date: "2026-01-01",
      match: { result: "partial", score: 0.9, method: "fuzzy", reason: "wording differs", closest: SENTINEL },
    },
  ],
  visibility,
  review: { state, by: "Lead", at: null },
  nextAction: null,
  conflictsWith: [],
  inference: false,
});

test("the reviewer gets the closest passage", () => {
  const out = viewClaim("lead", claim("team", "draft"));
  assert.equal(out.evidence[0].match.closest, SENTINEL);
});

test("incoming roles get the verification result but never the closest passage", () => {
  for (const role of ["incoming_lead", "incoming_developer"]) {
    const out = viewClaim(role, claim("team"));
    assert.equal(out.verification, "partial");
    assert.equal(out.evidence[0].match.result, "partial");
    assert.equal(out.evidence[0].match.reason, "wording differs");
    assert.equal(out.evidence[0].match.closest, null);
    assert.ok(!JSON.stringify(out).includes(SENTINEL));
  }
});

test("incoming lead sees a lead-only claim, still without the closest passage", () => {
  const out = viewClaim("incoming_lead", claim("lead_only"));
  assert.equal(out.evidence[0].match.closest, null);
  assert.ok(!JSON.stringify(out).includes(SENTINEL));
});

test("a lead-only claim is invisible to the developer", () => {
  assert.equal(viewClaim("incoming_developer", claim("lead_only")), null);
});

test("restricted claims are masked for incoming roles, with no evidence at all", () => {
  for (const role of ["incoming_lead", "incoming_developer"]) {
    const out = viewClaim(role, claim("restricted"));
    assert.deepEqual(out.evidence, []);
    assert.ok(!JSON.stringify(out).includes(SENTINEL));
    assert.equal(out.verification, undefined);
  }
});