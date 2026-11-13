const test = require("node:test");
const assert = require("node:assert");
const { planResolution } = require("../src/services/resolution");

const c = (claimId, conflictsWith, baseStatus = "verified", statement = "s " + claimId) => ({
  claimId, conflictsWith, baseStatus, statement, status: "conflicting",
});
const find = (plan, id) => plan.updates.find((u) => u.claimId === id);

test("a simple pair: the kept claim returns to what its evidence earned, the other is rejected", () => {
  const plan = planResolution([c("c_001", ["c_002"], "verified"), c("c_002", ["c_001"], "uncertain")], "c_001", "c_002");
  assert.deepEqual(find(plan, "c_001"), { claimId: "c_001", conflictsWith: [], status: "verified", review: "accepted" });
  assert.deepEqual(find(plan, "c_002"), { claimId: "c_002", conflictsWith: [], status: "uncertain", review: "rejected" });
});

test("keeping a claim never upgrades it past its base status", () => {
  const plan = planResolution([c("c_001", ["c_002"], "uncertain"), c("c_002", ["c_001"], "verified")], "c_001", "c_002");
  assert.equal(find(plan, "c_001").status, "uncertain");
});

test("a base status of 'conflicting' falls back to uncertain", () => {
  const plan = planResolution([c("c_001", ["c_002"], "conflicting"), c("c_002", ["c_001"])], "c_001", "c_002");
  assert.equal(find(plan, "c_001").status, "uncertain");
});

test("a third claim in another conflict stays conflicting; one that only pointed at the dropped claim is freed", () => {
  const claims = [
    c("c_001", ["c_002", "c_003"]),
    c("c_002", ["c_001", "c_003"]),
    c("c_003", ["c_001", "c_002"]),
    c("c_004", ["c_005"]),
    c("c_005", ["c_004"]),
  ];
  const plan = planResolution(claims, "c_001", "c_002");
  assert.deepEqual(find(plan, "c_001").conflictsWith, ["c_003"]);
  assert.equal(find(plan, "c_001").status, "conflicting");
  assert.deepEqual(find(plan, "c_003").conflictsWith, ["c_001"]);
  assert.equal(find(plan, "c_003").status, "conflicting");
  assert.deepEqual(find(plan, "c_002").conflictsWith, []);
  assert.equal(find(plan, "c_004"), undefined); // untouched
  assert.equal(find(plan, "c_005"), undefined);
});

test("bad pairs are refused", () => {
  const claims = [c("c_001", ["c_002"]), c("c_002", ["c_001"]), c("c_003", [])];
  assert.equal(planResolution(claims, "c_001", "c_001").status, 400);
  assert.equal(planResolution(claims, "c_001", "c_003").status, 409); // not linked
  assert.equal(planResolution(claims, "c_001", "c_999").status, 409); // unknown
  assert.equal(planResolution([c("c_001", ["c_002"]), c("c_002", [])], "c_001", "c_002").status, 409); // link is one-sided
});
