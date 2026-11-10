const test = require("node:test");
const assert = require("node:assert");
const { canSee, viewClaim, viewClaims } = require("../src/services/permissions");

const ROLES = ["incoming_developer", "incoming_lead", "lead"];
const LEVELS = ["team", "lead_only", "restricted"];

test("canSee matrix", () => {
  const expected = {
    incoming_developer: [true, false, false],
    incoming_lead: [true, true, false],
    lead: [true, true, true],
  };
  for (const role of ROLES) {
    LEVELS.forEach((level, i) => assert.equal(canSee(role, level), expected[role][i], role + " " + level));
  }
});

test("canSee fails closed on unknown or odd input", () => {
  for (const [role, level] of [
    ["admin", "team"], ["lead", "secret"], [undefined, "team"], ["lead", undefined],
    ["constructor", "team"], ["lead", "__proto__"], [null, null], ["lead", "toString"],
  ]) {
    assert.equal(canSee(role, level), false, String(role) + " " + String(level));
  }
});

const make = (id, visibility, state, extra = {}) => ({
  id, type: "decision", statement: "REAL_TEXT_" + id, status: "verified",
  evidence: [{ quote: "REAL_QUOTE_" + id, source: "a.md", chunk: 1, date: "2026-02-03" }],
  visibility, review: { state, by: state === "draft" ? null : "Lead", at: null },
  nextAction: "REAL_ACTION_" + id, conflictsWith: [], inference: true, ...extra,
});

test("non-reviewers never see draft or rejected claims, even team ones", () => {
  for (const role of ["incoming_developer", "incoming_lead"]) {
    assert.equal(viewClaim(role, make("c_001", "team", "draft")), null);
    assert.equal(viewClaim(role, make("c_002", "team", "rejected")), null);
    assert.ok(viewClaim(role, make("c_003", "team", "accepted")));
    assert.ok(viewClaim(role, make("c_004", "team", "edited")));
  }
});

test("reviewer sees every review state", () => {
  for (const state of ["draft", "accepted", "edited", "rejected"]) {
    assert.ok(viewClaim("lead", make("c_001", "restricted", state)));
  }
});

test("lead_only is invisible to the developer and real for the incoming lead", () => {
  const c = make("c_005", "lead_only", "accepted");
  assert.equal(viewClaim("incoming_developer", c), null);
  assert.equal(viewClaim("incoming_lead", c).statement, "REAL_TEXT_c_005");
});

test("restricted is masked for both incoming roles, with nothing from the original", () => {
  const c = make("c_006", "restricted", "accepted", { conflictsWith: ["c_001"] });
  for (const role of ["incoming_developer", "incoming_lead"]) {
    const out = viewClaim(role, c);
    assert.equal(out.statement, "Restricted: request access from reviewer");
    assert.deepEqual(out.evidence, []);
    assert.equal(out.nextAction, null);
    assert.deepEqual(out.conflictsWith, []);
    assert.equal(out.inference, false);
    const json = JSON.stringify(out);
    for (const secret of ["REAL_TEXT", "REAL_QUOTE", "REAL_ACTION"]) assert.ok(!json.includes(secret));
  }
  assert.equal(viewClaim("lead", c).statement, "REAL_TEXT_c_006");
});

test("an unapproved restricted claim is not even a placeholder for incoming roles", () => {
  assert.equal(viewClaim("incoming_lead", make("c_007", "restricted", "draft")), null);
});

test("conflict ids that point at hidden claims are removed", () => {
  const claims = [
    make("c_010", "team", "accepted", { conflictsWith: ["c_011", "c_012"] }),
    make("c_011", "lead_only", "accepted"),
    make("c_012", "team", "accepted"),
  ];
  const dev = viewClaims("incoming_developer", claims);
  assert.deepEqual(dev.find((c) => c.id === "c_010").conflictsWith, ["c_012"]);
  const lead = viewClaims("lead", claims);
  assert.deepEqual(lead.find((c) => c.id === "c_010").conflictsWith, ["c_011", "c_012"]);
});