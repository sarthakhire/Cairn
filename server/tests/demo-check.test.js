const test = require("node:test");
const assert = require("node:assert");
const { checkDemoState, summarise } = require("../src/services/demoCheck");

const match = (result, closest = null) => ({ result, score: 1, method: "exact", reason: null, closest });
let n = 0;
const claim = (visibility, verification, extra = {}) => {
  n += 1;
  return {
    id: "c_" + String(n).padStart(3, "0"),
    type: "decision",
    statement: "Statement " + n,
    status: verification === "none" ? "missing" : "verified",
    verification,
    evidence: verification === "none" ? [] : [{ quote: "q", source: "a.md", chunk: 1, date: "2026-02-03", match: match(verification) }],
    visibility,
    review: { state: "accepted", by: "Demo Lead", at: "2026-11-14T10:00:00", edited: false, originalStatement: null, reason: null, override: null, history: [] },
    nextAction: null,
    conflictsWith: [],
    inference: false,
    ...extra,
  };
};
const override = { reason: "The quote is right", by: "Demo Lead", at: "2026-11-14T10:00:00" };
const planted = [
  { id: "fabricated-quote", statement: "P1", expect: { result: "mismatch" } },
  { id: "near-miss", statement: "P2", expect: { result: "partial" } },
];
const draft = (statement, verification) =>
  claim("team", verification, { statement, review: { state: "draft", by: null, at: null, edited: false, originalStatement: null, reason: null, override: null, history: [] } });

function good() {
  n = 0;
  const approved = [
    ...Array.from({ length: 6 }, () => claim("team", "verified")),
    claim("team", "partial"),
    claim("team", "none"),
    claim("team", "mismatch", { review: { state: "accepted", by: "Demo Lead", at: "x", edited: false, originalStatement: null, reason: null, override, history: [] } }),
    claim("lead_only", "verified"),
    claim("lead_only", "verified"),
    claim("restricted", "verified"),
  ];
  const pending = [draft("P1", "mismatch"), draft("P2", "partial"), draft("Real pending 1", "verified"), draft("Real pending 2", "partial"), draft("P3", "mismatch")];
  return {
    users: [
      { email: "lead@demo.test", role: "lead" },
      { email: "incoming.lead@demo.test", role: "incoming_lead" },
      { email: "incoming.dev@demo.test", role: "incoming_developer" },
    ],
    sourceCount: 9,
    live: [...approved, ...pending],
    approval: { number: 1, claims: approved, acknowledgements: {} },
    latestVersionNumber: 1,
    auditRows: ["Accepted", "Accepted", "Rejected", "Edited", "Handover approved", "Previewed as incoming_developer", "Source imported", "Gap answered"].map((action) => ({ action })),
    planted,
  };
}
const find = (results, label) => results.find((r) => r.label.includes(label));

test("a correctly prepared demo has no failures and no warnings", () => {
  const results = checkDemoState(good());
  const s = summarise(results);
  assert.equal(s.fail, 0, JSON.stringify(results.filter((r) => r.level !== "pass")));
  assert.equal(s.warn, 0, JSON.stringify(results.filter((r) => r.level !== "pass")));
  assert.ok(s.pass > 20);
});

test("nothing approved is a failure", () => {
  const d = good();
  d.approval = null;
  assert.equal(find(checkDemoState(d), "a version is approved").level, "fail");
});

test("an approved version that is not number 1 is only a warning, one that is not the latest is a failure", () => {
  const d = good();
  d.approval.number = 14;
  d.latestVersionNumber = 14;
  assert.equal(find(checkDemoState(d), "number 1").level, "warn");
  d.latestVersionNumber = 15;
  assert.equal(find(checkDemoState(d), "is the latest").level, "fail");
});

test("a draft or an unexplained mismatch inside the approved snapshot is reported as a blocker", () => {
  const d = good();
  d.approval.claims.push(draft("Sneaked in", "verified"));
  const unexplained = claim("team", "mismatch");
  d.approval.claims.push(unexplained);
  const r = find(checkDemoState(d), "no blockers");
  assert.equal(r.level, "fail");
  assert.ok(r.detail.includes("draft") && r.detail.includes("mismatch"));
});

test("missing or wrong planted claims are failures", () => {
  const d = good();
  d.live = d.live.filter((c) => c.statement !== "P1");
  assert.equal(find(checkDemoState(d), "planted claim 'fabricated-quote' exists").level, "fail");
  const e = good();
  e.live.find((c) => c.statement === "P2").verification = "verified";
  assert.equal(find(checkDemoState(e), "'near-miss' shows partial").level, "fail");
  const f = good();
  f.live.find((c) => c.statement === "P2").review.state = "accepted";
  assert.equal(find(checkDemoState(f), "'near-miss' is waiting").level, "fail");
});

test("too few pending drafts, or only planted ones, is reported", () => {
  const d = good();
  d.live = d.live.filter((c) => !["Real pending 1", "Real pending 2"].includes(c.statement));
  const s = checkDemoState(d);
  assert.equal(find(s, "real claims are pending").level, "warn");
  assert.equal(find(s, "a pending queue").level, "fail"); // 3 drafts left, fewer than 5
});

test("an empty audit log and a thin one are warnings", () => {
  const d = good();
  d.auditRows = [];
  const s = checkDemoState(d);
  assert.equal(find(s, "audit log has history").level, "warn");
  assert.equal(find(s, "audit has 'Handover approved'").level, "warn");
});

test("an acknowledgement already recorded is a warning", () => {
  const d = good();
  d.approval.acknowledgements = { incoming_developer: { at: "x" } };
  assert.equal(find(checkDemoState(d), "acknowledged").level, "warn");
});

test("a developer who sees almost nothing, or missing demo accounts, fail", () => {
  const d = good();
  d.approval.claims = d.approval.claims.slice(0, 3);
  assert.equal(find(checkDemoState(d), "developer sees real content").level, "fail");
  const e = good();
  e.users = e.users.filter((u) => u.role !== "incoming_lead");
  assert.equal(find(checkDemoState(e), "incoming.lead@demo.test").level, "fail");
});

test("the role views are really filtered: reviewer-only fields never appear for incoming roles", () => {
  const d = good();
  d.approval.claims[0].review.history = [{ action: "accept", fromStatement: "SECRET_HISTORY" }];
  d.approval.claims[0].review.originalStatement = "SECRET_ORIGINAL";
  d.approval.claims[0].evidence[0].match.closest = "SECRET_CLOSEST";
  const s = checkDemoState(d);
  assert.equal(find(s, "incoming_developer view carries no reviewer-only field").level, "pass");
  assert.equal(find(s, "incoming_developer view carries no closest passage").level, "pass");
});

test("summarise counts each level", () => {
  assert.deepEqual(summarise([{ level: "pass" }, { level: "warn" }, { level: "fail" }, { level: "pass" }]), { pass: 2, warn: 1, fail: 1 });
});