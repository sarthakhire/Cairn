const test = require("node:test");
const assert = require("node:assert");
const { planReview } = require("../src/services/reviewActions");

const USER = { id: "u1", name: "Demo Lead" };
const NOW = new Date("2026-11-14T10:00:00Z");
const GOOD = { quoteFound: true, supportsStatement: true }; // verification: verified
const MISMATCH = { quoteFound: false, supportsStatement: null }; // verification: mismatch

const claim = (state, extra = {}) => ({
  statement: "Old wording",
  evidence: [GOOD],
  review: { state },
  ...extra,
});
const plan = (c, body) => planReview({ claim: c, body, user: USER, now: NOW });
const BODY = {
  accept: { action: "accept" },
  edit: { action: "edit", statement: "New wording" },
  reject: { action: "reject", reason: "Not what the notes say" },
  reopen: { action: "reopen" },
};

test("transition matrix: every state against every action", () => {
  const expected = {
    draft: { accept: "accepted", edit: "edited", reject: "rejected", reopen: "noop" },
    accepted: { accept: "noop", edit: "edited", reject: "rejected", reopen: "draft" },
    edited: { accept: "noop", edit: "edited", reject: "rejected", reopen: "draft" },
    rejected: { accept: "accepted", edit: "edited", reject: "noop", reopen: "draft" },
  };
  for (const [state, row] of Object.entries(expected)) {
    for (const [action, want] of Object.entries(row)) {
      const p = plan(claim(state), BODY[action]);
      if (want === "noop") assert.deepEqual(p, { noop: true }, `${state} + ${action}`);
      else {
        assert.equal(p.error, undefined, `${state} + ${action}: ${p.error}`);
        assert.equal(p.to, want, `${state} + ${action}`);
        assert.equal(p.set["review.state"], want);
        assert.equal(p.from, state);
      }
    }
  }
});

test("reject needs a reason of 10 to 500 characters", () => {
  const r = (reason) => plan(claim("draft"), { action: "reject", reason });
  for (const bad of [undefined, "", "   ", "123456789", "x".repeat(501), 42, null]) {
    assert.equal(r(bad).status, 400, String(bad));
  }
  assert.equal(r("1234567890").error, undefined);
  assert.equal(r("x".repeat(500)).error, undefined);
  assert.equal(r("  padded reason here  ").set["review.reason"], "padded reason here");
});

test("bad input is a 400 even when the action would otherwise change nothing", () => {
  assert.equal(plan(claim("rejected"), { action: "reject" }).status, 400);
  assert.equal(plan(claim("draft"), { action: "reopen", reason: "x".repeat(501) }).status, 400);
});

test("edit needs a statement of 1 to 1000 characters, and a changed one", () => {
  for (const s of [undefined, "", "   ", "x".repeat(1001), 5]) {
    assert.equal(plan(claim("draft"), { action: "edit", statement: s }).status, 400, String(s));
  }
  assert.equal(plan(claim("draft"), { action: "edit", statement: "x".repeat(1000) }).error, undefined);
  assert.equal(plan(claim("draft"), { action: "edit", statement: "Old wording" }).error, "The statement is unchanged");
  assert.equal(plan(claim("accepted"), { action: "edit", statement: "  Old wording  " }).status, 400);
});

test("unknown actions are refused, including inherited property names", () => {
  for (const action of [undefined, "", "delete", "constructor", "toString", "ACCEPT"]) {
    assert.equal(plan(claim("draft"), { action }).status, 400, String(action));
  }
  assert.equal(planReview({ claim: claim("draft"), body: undefined, user: USER, now: NOW }).status, 400);
});

test("a mismatch claim needs an override to be accepted or edited", () => {
  const c = claim("draft", { evidence: [MISMATCH] });
  const a = plan(c, { action: "accept" });
  assert.equal(a.status, 400);
  assert.match(a.error, /does not match its source/);
  assert.equal(plan(c, { action: "edit", statement: "New wording" }).status, 400);
  assert.equal(plan(c, { action: "accept", override: "too short" }).status, 400);
  assert.equal(plan(c, { action: "accept", override: "x".repeat(501) }).status, 400);
  assert.equal(plan(c, { action: "accept", override: "The quote is right, the check was too strict" }).error, undefined);
  assert.equal(plan(c, { action: "edit", statement: "New wording", override: "Reworded to match the notes" }).error, undefined);
});

test("reject and reopen never need an override, even on a mismatch claim", () => {
  const c = claim("accepted", { evidence: [MISMATCH] });
  assert.equal(plan(c, BODY.reject).error, undefined);
  assert.equal(plan(c, BODY.reopen).error, undefined);
});

test("verified, partial and no-evidence claims need no override", () => {
  const partial = { quoteFound: true, supportsStatement: null };
  for (const evidence of [[GOOD], [partial], []]) {
    assert.equal(plan(claim("draft", { evidence }), BODY.accept).error, undefined);
  }
});

test("a repeated action on a mismatch claim is a no-op, not a new demand for an override", () => {
  assert.deepEqual(plan(claim("accepted", { evidence: [MISMATCH] }), { action: "accept" }), { noop: true });
});

test("an override is stored with who and when, and also kept in the history entry", () => {
  const c = claim("draft", { evidence: [MISMATCH] });
  const p = plan(c, { action: "accept", override: "  The quote is right, the check was too strict  " });
  assert.deepEqual(p.set["review.override"], {
    reason: "The quote is right, the check was too strict",
    byId: "u1",
    byName: "Demo Lead",
    at: NOW,
  });
  assert.equal(p.push["review.history"].reason, "The quote is right, the check was too strict");
  assert.ok(p.audit.detail.includes("Override: "));
});

test("accept clears an old reason, reject stores one", () => {
  const rejected = plan(claim("draft"), BODY.reject);
  assert.equal(rejected.set["review.reason"], "Not what the notes say");
  assert.equal(rejected.set["review.override"], null);
  const accepted = plan(claim("rejected", { review: { state: "rejected", reason: "old reason here" } }), BODY.accept);
  assert.equal(accepted.set["review.reason"], null);
});

test("reopen clears who, when, reason and override; the history keeps the reopen reason", () => {
  const p = plan(claim("accepted"), { action: "reopen", reason: "Checking this again" });
  assert.equal(p.set["review.state"], "draft");
  assert.equal(p.set["review.reviewerId"], null);
  assert.equal(p.set["review.at"], null);
  assert.equal(p.set["review.reason"], null);
  assert.equal(p.set["review.override"], null);
  assert.equal(p.push["review.history"].reason, "Checking this again");
  assert.equal(plan(claim("accepted"), BODY.reopen).push["review.history"].reason, null);
});

test("the first edit keeps the original wording, later edits do not replace it", () => {
  const first = plan(claim("draft"), BODY.edit);
  assert.equal(first.set["review.originalStatement"], "Old wording");
  assert.equal(first.set.statement, "New wording");
  const later = plan(claim("edited", { statement: "New wording", review: { state: "edited", originalStatement: "Old wording" } }), { action: "edit", statement: "Newer wording" });
  assert.ok(!("review.originalStatement" in later.set));
  assert.equal(later.push["review.history"].fromStatement, "New wording");
  assert.equal(later.push["review.history"].toStatement, "Newer wording");
});

test("every change appends exactly one history entry of the documented shape", () => {
  const p = plan(claim("draft"), BODY.reject);
  assert.deepEqual(Object.keys(p.push), ["review.history"]);
  assert.deepEqual(p.push["review.history"], {
    at: NOW,
    byId: "u1",
    byName: "Demo Lead",
    action: "reject",
    fromState: "draft",
    toState: "rejected",
    fromStatement: "Old wording",
    toStatement: "Old wording",
    reason: "Not what the notes say",
  });
});

test("only review fields and the statement are ever written, never status or evidence", () => {
  for (const state of ["draft", "accepted", "edited", "rejected"]) {
    for (const action of Object.keys(BODY)) {
      const p = plan(claim(state), BODY[action]);
      if (p.noop) continue;
      for (const key of Object.keys(p.set)) {
        assert.ok(key === "statement" || key.startsWith("review."), key);
      }
    }
  }
});

test("the audit row has the reason in detail and the old and new statement in before and after", () => {
  const e = plan(claim("draft"), { action: "edit", statement: "New wording" });
  assert.equal(e.audit.action, "Edited");
  assert.ok(e.audit.detail.startsWith("From: Old wording To: New wording"));
  assert.deepEqual(e.audit.before, { statement: "Old wording", state: "draft" });
  assert.deepEqual(e.audit.after, { statement: "New wording", state: "edited", reason: null });
  const r = plan(claim("draft"), BODY.reject);
  assert.equal(r.audit.action, "Rejected");
  assert.ok(r.audit.detail.endsWith("Reason: Not what the notes say"));
  assert.equal(r.audit.after.reason, "Not what the notes say");
  assert.equal(plan(claim("accepted"), BODY.reopen).audit.action, "Reopened");
  assert.equal(plan(claim("draft"), BODY.accept).audit.action, "Accepted");
});

test("long text is cut at 80 characters in the audit detail only", () => {
  const long = "x".repeat(200);
  const p = plan(claim("draft", { statement: long }), BODY.reject);
  assert.ok(p.audit.detail.startsWith("x".repeat(80) + "..."));
  assert.equal(p.audit.before.statement, long);
});