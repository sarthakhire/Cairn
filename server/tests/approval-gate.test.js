const test = require("node:test");
const assert = require("node:assert");
const { findBlockers, warningCounts, sameClaims } = require("../src/services/approvalGate");

const claim = (id, state, verification, status = "verified", extraReview = {}) => ({
  id,
  status,
  verification,
  review: { state, ...extraReview },
});

test("a draft blocks, whatever its verification", () => {
  const b = findBlockers([claim("c_001", "draft", "verified"), claim("c_002", "draft", "mismatch")]);
  assert.deepEqual(b, [
    { id: "c_001", kind: "draft", message: "Still a draft" },
    { id: "c_002", kind: "draft", message: "Still a draft" },
  ]);
});

test("an accepted or edited mismatch blocks", () => {
  const b = findBlockers([claim("c_001", "accepted", "mismatch"), claim("c_002", "edited", "mismatch")]);
  assert.deepEqual(b, [
    { id: "c_001", kind: "mismatch", message: "Accepted but the quote does not match the source" },
    { id: "c_002", kind: "mismatch", message: "Accepted but the quote does not match the source" },
  ]);
});

test("an overridden mismatch does not block", () => {
  const overridden = claim("c_001", "accepted", "mismatch", "uncertain", {
    override: { reason: "The quote is right, the support check was too strict", byId: "u1", at: "2026-11-14T10:00:00" },
  });
  assert.deepEqual(findBlockers([overridden]), []);
});

test("partial, uncertain, missing and conflicting claims do not block", () => {
  const b = findBlockers([
    claim("c_001", "accepted", "partial", "uncertain"),
    claim("c_002", "accepted", "none", "missing"),
    claim("c_003", "accepted", "verified", "conflicting"),
    claim("c_004", "edited", "verified", "uncertain"),
  ]);
  assert.deepEqual(b, []);
});

test("rejected claims never block, even with a mismatch", () => {
  assert.deepEqual(findBlockers([claim("c_001", "rejected", "mismatch", "uncertain")]), []);
});

test("nothing to approve means nothing blocks", () => {
  assert.deepEqual(findBlockers([]), []);
  assert.deepEqual(findBlockers(undefined), []);
});

test("blockers keep the order of the claims", () => {
  const b = findBlockers([
    claim("c_003", "accepted", "mismatch"),
    claim("c_001", "draft", "verified"),
    claim("c_002", "accepted", "verified"),
  ]);
  assert.deepEqual(b.map((x) => x.id), ["c_003", "c_001"]);
});

test("warning counts cover only shared claims (accepted or edited)", () => {
  const w = warningCounts([
    claim("c_001", "accepted", "partial", "uncertain"),
    claim("c_002", "edited", "verified", "missing"),
    claim("c_003", "accepted", "verified", "conflicting"),
    claim("c_004", "rejected", "partial", "uncertain"), // not shared, not counted
    claim("c_005", "accepted", "verified", "verified"),
  ]);
  assert.deepEqual(w, { partial: 1, uncertain: 1, missing: 1, conflicting: 1 });
});

test("warning counts of nothing are all zero", () => {
  assert.deepEqual(warningCounts([]), { partial: 0, uncertain: 0, missing: 0, conflicting: 0 });
});

test("sameClaims ignores key order and undefined fields, notices real changes", () => {
  const a = [{ id: "c_001", review: { state: "accepted", by: "Lead" }, x: undefined }];
  const same = [{ review: { by: "Lead", state: "accepted" }, id: "c_001" }];
  assert.equal(sameClaims(a, same), true);
  assert.equal(sameClaims(a, structuredClone(a)), true);
  const changed = structuredClone(same);
  changed[0].review.state = "rejected";
  assert.equal(sameClaims(a, changed), false);
  assert.equal(sameClaims(a, []), false);
  assert.equal(sameClaims([], []), true);
});