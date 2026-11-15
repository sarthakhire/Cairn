// Steps S3.1 and S3.2: the audit row shape and the logging of refused requests.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const AuditLog = require("../src/models/AuditLog");
const Claim = require("../src/models/Claim");
const Handover = require("../src/models/Handover");
const Version = require("../src/models/Version");
const { serializeClaim } = require("../src/services/serializer");
const audit = require("../src/services/audit");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

// ---- Database stand-ins -----------------------------------------------------------
let rows;
let createMode; // "ok" | "reject" | "throw"
AuditLog.create = (d) => {
  if (createMode === "throw") throw new Error("database is down");
  if (createMode === "reject") return Promise.reject(new Error("database is down"));
  rows.push(structuredClone(d));
  return Promise.resolve();
};

const chunk = (n, name) => ({ n, timestamp: new Date("2026-02-03T00:00:00Z"), sourceId: { name } });
const stored = (claimId, visibility, state, statement) => ({
  claimId, type: "decision", statement, status: "uncertain", visibility,
  evidence: [{ quote: "a quote long enough to count", chunkId: chunk(1, "src.md") }],
  review: { state, reviewerId: state === "draft" ? null : { name: "Lead" }, at: null },
  nextAction: null, conflictsWith: [], inference: false,
});
const FIXTURES = [
  stored("c_001", "team", "accepted", "Team claim"),
  stored("c_002", "lead_only", "accepted", "Lead only claim"),
  stored("c_004", "team", "draft", "Draft claim"),
];
const chain = (result) => {
  const c = { sort: () => c, limit: () => c, populate: () => c, lean: () => c, select: () => c,
    then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  return c;
};
Claim.find = (filter = {}) => chain(structuredClone(FIXTURES.filter((c) =>
  filter.claimId ? (filter.claimId.$in ? filter.claimId.$in.includes(c.claimId) : c.claimId === filter.claimId) : true)));
Handover.findById = () => chain({ _id: "handover", approvedVersion: 1, acknowledgements: {} });
Version.findOne = () => chain({
  number: 1, byName: "Lead", at: new Date("2026-03-02T18:40:00Z"),
  claims: structuredClone(FIXTURES.map(serializeClaim)),
});
AuditLog.find = () => chain([]);

test.beforeEach(() => {
  rows = [];
  createMode = "ok";
  audit.resetDenialMemory();
});

const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: role });
const send = (method, path, role) => {
  const r = request(app)[method](path);
  return role ? r.set("Authorization", "Bearer " + tokenFor(role)) : r;
};
// The denial is written in the background, so give it a moment to finish.
const settle = async () => { await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };

// ---- S3.1 shapes ------------------------------------------------------------------
test("serializeAudit keeps the original four fields", () => {
  const row = { _id: "65f000000000000000000001", at: "2026-03-02T18:40:00Z", action: "Accepted", detail: "x", actorId: { name: "Lead", role: "lead" }, outcome: "denied", claimId: "c_001" };
  assert.deepEqual(audit.serializeAudit(row), { at: "2026-03-02T18:40:00", actor: "Lead", action: "Accepted", detail: "x" });
});

test("serializeAuditEvent adds id, role, outcome and claim", () => {
  const row = { _id: "65f000000000000000000001", at: "2026-03-02T18:40:00Z", action: "Access denied", detail: "d", actorId: { name: "Dev", role: "incoming_developer" }, outcome: "denied", claimId: "c_001" };
  assert.deepEqual(audit.serializeAuditEvent(row), {
    id: "65f000000000000000000001", at: "2026-03-02T18:40:00", actor: "Dev", role: "incoming_developer",
    action: "Access denied", outcome: "denied", claimId: "c_001", detail: "d",
  });
});

test("old rows without outcome, claim or populated actor still serialize", () => {
  const old = { _id: "65f000000000000000000002", at: "2026-01-01T00:00:00Z", action: "extract", detail: null, actorId: null, after: { claimsCreated: 3, verified: 1, draftsReplaced: 2 } };
  const e = audit.serializeAuditEvent(old);
  assert.equal(e.outcome, "allowed");
  assert.equal(e.claimId, null);
  assert.equal(e.actor, "Unknown");
  assert.equal(e.role, null);
  assert.equal(e.action, "Extraction run");
  assert.equal(e.detail, "3 claims created, 1 verified, 2 drafts replaced");
});

test("ordinary rows are written exactly as before, denied rows carry the outcome", async () => {
  await audit.record({ actorId: "a", action: "Accepted", claimId: "c_001", detail: "x" });
  assert.deepEqual(rows[0], { actorId: "a", action: "Accepted", claimId: "c_001", detail: "x", before: null, after: null });
  await audit.record({ actorId: "a", action: "Access denied", detail: "y", outcome: "denied" });
  assert.equal(rows[1].outcome, "denied");
});

test("the model has the outcome field and the three indexes", () => {
  assert.equal(AuditLog.schema.path("outcome").defaultValue, "allowed");
  assert.deepEqual(AuditLog.schema.path("outcome").enumValues, ["allowed", "denied"]);
  const keys = AuditLog.schema.indexes().map(([k]) => JSON.stringify(k));
  for (const k of ['{"at":-1}', '{"action":1,"at":-1}', '{"claimId":1}']) assert.ok(keys.includes(k), "missing index " + k);
});

// ---- S3.2 denied logging, unit ----------------------------------------------------
test("recordDenied writes once per actor and text inside a minute, again after", async () => {
  const base = { actorId: "a1", role: "incoming_developer", method: "get", url: "/api/audit?x=1" };
  audit.recordDenied({ ...base, now: 1_000 });
  audit.recordDenied({ ...base, now: 30_000 });
  audit.recordDenied({ ...base, now: 60_999 });
  assert.equal(rows.length, 1);
  audit.recordDenied({ ...base, now: 61_001 });
  assert.equal(rows.length, 2);
  audit.recordDenied({ ...base, url: "/api/sources", now: 61_002 }); // different text
  audit.recordDenied({ ...base, actorId: "a2", now: 61_003 }); // different actor
  assert.equal(rows.length, 4);
  assert.equal(rows[0].detail, "incoming_developer tried GET /api/audit"); // no query string
  assert.equal(rows[0].outcome, "denied");
  assert.equal(rows[0].action, "Access denied");
});

test("recordDenied never throws or rejects, even when the database fails", async () => {
  for (const mode of ["reject", "throw"]) {
    createMode = mode;
    audit.resetDenialMemory();
    assert.doesNotThrow(() => audit.recordDenied({ actorId: "a", role: "r", method: "GET", url: "/x" }));
    await settle();
  }
  assert.doesNotThrow(() => audit.recordDenied({}));
  assert.doesNotThrow(() => audit.recordDenied({ actorId: "a", url: { not: "a string" } }));
});

test("no actor, no row", () => {
  audit.recordDenied({ actorId: undefined, role: "x", method: "GET", url: "/api/audit" });
  assert.equal(rows.length, 0);
});

// ---- S3.2 denied logging, through the real routes ---------------------------------
test("403 for a non-reviewer is unchanged and writes one denied row", async () => {
  const res = await send("get", "/api/audit", "incoming_developer");
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: "Not allowed" });
  await settle();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "Access denied");
  assert.equal(rows[0].outcome, "denied");
  assert.equal(rows[0].detail, "incoming_developer tried GET /api/audit");
  assert.equal(rows[0].actorId, "u_incoming_developer");
});

test("the same refused request again inside a minute adds no row", async () => {
  await send("get", "/api/audit", "incoming_developer");
  await send("get", "/api/audit", "incoming_developer");
  await send("get", "/api/audit?limit=5", "incoming_developer");
  await settle();
  assert.equal(rows.length, 1);
});

test("other refused routes are logged, and a claim id in the path fills claimId", async () => {
  assert.equal((await send("post", "/api/sources", "incoming_lead")).status, 403);
  const patchRes = await send("patch", "/api/claims/c_001", "incoming_lead").send({ action: "accept" });
  assert.equal(patchRes.status, 403);
  await settle();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].detail, "incoming_lead tried POST /api/sources");
  assert.equal(rows[1].detail, "incoming_lead tried PATCH /api/claims/c_001");
  assert.equal(rows[1].claimId, "c_001");
});

test("allowed requests and unauthenticated requests write no denied row", async () => {
  assert.equal((await send("get", "/api/audit", "lead")).status, 200);
  assert.equal((await send("get", "/api/audit")).status, 401);
  const bad = await request(app).get("/api/audit").set("Authorization", "Bearer nonsense");
  assert.equal(bad.status, 401);
  await settle();
  assert.equal(rows.length, 0);
});

test("a database failure in the logger does not change the 403", async () => {
  const baseline = await send("get", "/api/audit", "incoming_developer");
  for (const mode of ["reject", "throw"]) {
    createMode = mode;
    audit.resetDenialMemory();
    const res = await send("get", "/api/audit", "incoming_developer");
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, baseline.body);
    await settle();
  }
});

// ---- Hidden claim probes ----------------------------------------------------------
test("hidden claim: response is identical to a missing claim, and only the real id is logged", async () => {
  const hidden = await send("get", "/api/claims/c_002", "incoming_developer"); // lead_only, exists
  const missing = await send("get", "/api/claims/c_999", "incoming_developer"); // does not exist
  assert.equal(hidden.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(hidden.body, missing.body);
  await settle();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "Hidden claim requested");
  assert.equal(rows[0].claimId, "c_002");
  assert.equal(rows[0].outcome, "denied");
  assert.equal(rows[0].detail, "incoming_developer requested c_002, which they cannot see");
});

test("a draft is hidden from the incoming lead and is logged; a visible claim is not", async () => {
  assert.equal((await send("get", "/api/claims/c_004", "incoming_lead")).status, 404);
  assert.equal((await send("get", "/api/claims/c_001", "incoming_lead")).status, 200);
  await settle();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].claimId, "c_004");
});

test("the reviewer is never logged for reading claims, and a bad id format is not logged", async () => {
  assert.equal((await send("get", "/api/claims/c_002", "lead")).status, 200);
  assert.equal((await send("get", "/api/claims/c_999", "lead")).status, 404);
  assert.equal((await send("get", "/api/claims/not-an-id", "incoming_developer")).status, 404);
  await settle();
  assert.equal(rows.length, 0);
});

test("probing the same hidden claim repeatedly writes one row", async () => {
  for (let i = 0; i < 4; i++) await send("get", "/api/claims/c_002", "incoming_developer");
  await settle();
  assert.equal(rows.length, 1);
});

test("a failing logger does not change the hidden-claim response", async () => {
  const baseline = await send("get", "/api/claims/c_999", "incoming_developer");
  createMode = "reject";
  const res = await send("get", "/api/claims/c_002", "incoming_developer");
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, baseline.body);
  await settle();
});