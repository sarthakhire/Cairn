const test = require("node:test");
const assert = require("node:assert");
const { viewClaim, viewClaims } = require("../src/services/permissions");

const SECRETS = ["ORIG_SECRET", "REASON_SECRET", "OVERRIDE_SECRET", "HISTORY_SECRET"];
const reviewFull = (state = "edited") => ({
  state,
  by: "Lead",
  at: "2026-03-02T18:40:00",
  edited: true,
  originalStatement: "ORIG_SECRET",
  reason: "REASON_SECRET",
  override: { reason: "OVERRIDE_SECRET", by: "Lead", at: "2026-03-02T18:40:00" },
  history: [
    { at: "2026-03-02T18:40:00", by: "Lead", action: "edit", fromState: "draft", toState: "edited",
      fromStatement: "HISTORY_SECRET from", toStatement: "HISTORY_SECRET to", reason: "HISTORY_SECRET reason" },
  ],
  futureField: "FUTURE_SECRET", // a review field added later must not pass through either
});
const claim = (visibility, review = reviewFull()) => ({
  id: "c_1", type: "decision", statement: "Statement", status: "uncertain", verification: "partial",
  evidence: [], visibility, review, nextAction: null, conflictsWith: [], inference: false,
});
const leaks = (value) => [...SECRETS, "FUTURE_SECRET"].filter((s) => JSON.stringify(value).includes(s));

test("the reviewer gets every review field", () => {
  const out = viewClaim("lead", claim("team"));
  assert.deepEqual(leaks(out), [...SECRETS, "FUTURE_SECRET"]);
});

test("incoming roles get only state, by, at and edited, for every visible tier", () => {
  for (const [role, tier] of [["incoming_developer", "team"], ["incoming_lead", "team"], ["incoming_lead", "lead_only"]]) {
    const out = viewClaim(role, claim(tier));
    assert.deepEqual(out.review, { state: "edited", by: "Lead", at: "2026-03-02T18:40:00", edited: true });
    assert.deepEqual(leaks(out), [], `${role} ${tier}`);
  }
});

test("a masked restricted claim carries no reviewer-only field either", () => {
  for (const role of ["incoming_developer", "incoming_lead"]) {
    const out = viewClaim(role, claim("restricted", reviewFull("accepted")));
    assert.deepEqual(out.review, { state: "accepted", by: "Lead", at: "2026-03-02T18:40:00", edited: true });
    assert.deepEqual(out.evidence, []);
    assert.deepEqual(leaks(out), [], role);
  }
});

test("hidden claims stay hidden", () => {
  assert.equal(viewClaim("incoming_developer", claim("lead_only")), null);
  assert.equal(viewClaim("incoming_developer", claim("team", reviewFull("draft"))), null);
  assert.equal(viewClaim("incoming_lead", claim("team", reviewFull("rejected"))), null);
});

test("viewClaims applies the same rule to a whole list", () => {
  const list = [claim("team"), { ...claim("restricted"), id: "c_2" }, { ...claim("lead_only"), id: "c_3" }];
  for (const role of ["incoming_developer", "incoming_lead"]) {
    assert.deepEqual(leaks(viewClaims(role, list)), [], role);
  }
});

test("old snapshots without an edited flag: edited follows the state", () => {
  const old = (state) => claim("team", { state, by: "Lead", at: "2026-03-02T18:40:00" });
  assert.equal(viewClaim("incoming_lead", old("edited")).review.edited, true);
  assert.equal(viewClaim("incoming_lead", old("accepted")).review.edited, false);
});

test("a claim with no review object does not crash the filter", () => {
  const c = claim("restricted");
  delete c.review;
  assert.equal(viewClaim("lead", c), c);
});