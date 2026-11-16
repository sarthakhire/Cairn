// Checks that the demo database is in the state the judges should find. Pure: the wrapper
// (scripts/check-demo.js) loads the data, this file only judges it, so it can be tested without a database.
const { viewClaims } = require("./permissions");
const { findBlockers } = require("./approvalGate");

const DEMO_ACCOUNTS = [
  ["lead@demo.test", "lead"],
  ["incoming.lead@demo.test", "incoming_lead"],
  ["incoming.dev@demo.test", "incoming_developer"],
];
const INCOMING = ["incoming_lead", "incoming_developer"];
const REVIEWER_ONLY_KEYS = ["originalStatement", "history", "override"];

const shared = (c) => ["accepted", "edited"].includes(c.review && c.review.state);
const count = (list, fn) => list.filter(fn).length;

// data: { users, sourceCount, live, approval, latestVersionNumber, auditRows, planted }
//   users: [{ email, role }]            live: every claim in the reviewer's view (serialized)
//   approval: { number, claims, acknowledgements } or null (the approved snapshot)
//   auditRows: [{ action, outcome }]    planted: the entries of seed-data/planted-claims.json
// Returns [{ level: "pass" | "warn" | "fail", label, detail }].
function checkDemoState(data) {
  const out = [];
  const add = (level, label, detail = "") => out.push({ level, label, detail });
  const check = (ok, label, detail, level = "fail") => add(ok ? "pass" : level, label, detail);

  // Accounts and sources
  for (const [email, role] of DEMO_ACCOUNTS) {
    const u = (data.users || []).find((x) => x.email === email);
    check(!!u && u.role === role, "demo account " + email, u ? "role " + u.role : "missing");
  }
  check(data.sourceCount >= 7, "sources uploaded", data.sourceCount + " (expected at least 7)");

  // Live claims
  const live = data.live || [];
  check(live.some((c) => c.visibility === "lead_only") && live.some((c) => c.visibility === "restricted"), "claims in every tier", "team, lead-only and restricted");

  // The approved version
  const ap = data.approval;
  if (!ap) {
    add("fail", "a version is approved", "nothing is shared yet, so incoming roles see an empty screen");
  } else {
    add("pass", "a version is approved", "version " + ap.number);
    check(ap.number === 1, "the approved version is number 1", "it is " + ap.number, "warn");
    check(ap.number === data.latestVersionNumber, "the approved version is the latest", "latest is " + data.latestVersionNumber);
    const blockers = findBlockers(ap.claims);
    check(blockers.length === 0, "the approved snapshot has no blockers", blockers.length ? blockers.map((b) => b.id + " " + b.kind).join(", ") : "no drafts, no unexplained mismatches");

    const sharedClaims = ap.claims.filter(shared);
    const ver = (v) => count(sharedClaims, (c) => c.verification === v);
    check(ver("verified") >= 5, "shared claims include verified ones", ver("verified") + " verified");
    check(ver("partial") >= 1, "shared claims include a partial match", ver("partial") + " partial", "warn");
    check(ver("none") >= 1, "shared claims include a gap with no evidence", ver("none") + " without evidence", "warn");
    const overridden = count(sharedClaims, (c) => c.verification === "mismatch" && c.review && c.review.override);
    check(overridden >= 1, "an overridden mismatch is shown", overridden + " claim(s) accepted with a written reason", "warn");

    // What each incoming role would actually see
    const views = Object.fromEntries(INCOMING.map((r) => [r, viewClaims(r, ap.claims)]));
    check(views.incoming_developer.length >= 8, "the developer sees real content", views.incoming_developer.length + " claims");
    check(views.incoming_lead.length > views.incoming_developer.length, "the incoming lead sees more than the developer", views.incoming_lead.length + " vs " + views.incoming_developer.length);
    for (const role of INCOMING) {
      check(count(views[role], (c) => c.visibility === "restricted") >= 1, role + " sees a masked restricted claim", "", "warn");
      const text = JSON.stringify(views[role]);
      const leaked = REVIEWER_ONLY_KEYS.filter((k) => text.includes('"' + k + '"'));
      check(leaked.length === 0, role + " view carries no reviewer-only field", leaked.join(", "));
      check(!views[role].some((c) => c.evidence.some((e) => e.match && e.match.closest)), role + " view carries no closest passage", "");
    }
    const acks = Object.keys(ap.acknowledgements || {});
    check(acks.length === 0, "nobody has acknowledged yet", acks.length ? acks.join(", ") + " already did" : "judges can try it", "warn");
  }

  // The pending queue
  const drafts = live.filter((c) => c.review && c.review.state === "draft");
  check(drafts.length >= 5, "a pending queue waits for the lead", drafts.length + " drafts");
  for (const p of data.planted || []) {
    const c = live.find((x) => x.statement === p.statement);
    if (!c) {
      add("fail", "planted claim '" + p.id + "' exists", "run: npm run seed:planted");
      continue;
    }
    check(c.review.state === "draft", "planted claim '" + p.id + "' is waiting for review", "state " + c.review.state);
    check(c.verification === p.expect.result, "planted claim '" + p.id + "' shows " + p.expect.result, "it shows " + c.verification);
  }
  const plantedStatements = new Set((data.planted || []).map((p) => p.statement));
  check(count(drafts, (c) => !plantedStatements.has(c.statement)) >= 2, "real claims are pending too, not only the planted ones", "", "warn");

  // The audit log
  const rows = data.auditRows || [];
  check(rows.length >= 8, "the audit log has history", rows.length + " rows (expected at least 8)", "warn");
  for (const action of ["Accepted", "Rejected", "Handover approved"]) {
    check(rows.some((r) => r.action === action), "audit has '" + action + "'", "", "warn");
  }
  return out;
}

const summarise = (results) => ({
  pass: count(results, (r) => r.level === "pass"),
  warn: count(results, (r) => r.level === "warn"),
  fail: count(results, (r) => r.level === "fail"),
});

module.exports = { checkDemoState, summarise, DEMO_ACCOUNTS };