// GET /api/audit/events through the real app, real JWT and real permission code.
// Only the database models are replaced by small stand-ins.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const AuditLog = require("../src/models/AuditLog");
const User = require("../src/models/User");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");
const audit = require("../src/services/audit");

const hex = (n) => n.toString(16).padStart(24, "0");
const doc = (n, extra = {}) => ({
  _id: hex(n),
  at: new Date(Date.UTC(2026, 10, 14, 10, 0, n)),
  actorId: { name: "Demo Lead", role: "lead" },
  action: "Accepted",
  claimId: "c_001",
  detail: "Team claim",
  ...extra,
});

let docs, cursorRow, findCalls, lastFilter, lastLimit, created;

function reset() {
  docs = [];
  cursorRow = null;
  findCalls = 0;
  lastFilter = undefined;
  lastLimit = undefined;
  created = [];
  audit.resetDenialMemory();
}

AuditLog.find = (filter) => {
  findCalls += 1;
  lastFilter = filter;
  const q = {
    sort: () => q,
    limit: (n) => ((lastLimit = n), q),
    populate: () => q,
    lean: () => q,
    then: (ok, bad) => Promise.resolve(docs).then(ok, bad),
  };
  return q;
};
AuditLog.findById = () => ({ select: () => ({ lean: async () => cursorRow }) });
AuditLog.create = async (d) => {
  created.push(structuredClone(d));
};
User.find = () => ({ select: () => ({ lean: async () => [{ _id: "u_lead" }] }) });

const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: "Name " + role });
const get = (path, role) => {
  const r = request(app).get(path);
  return role ? r.set("Authorization", "Bearer " + tokenFor(role)) : r;
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("the reviewer gets rows in the events shape and a cursor when there is another page", async () => {
  reset();
  docs = [
    doc(3),
    doc(2, { action: "extract", claimId: null, detail: null, after: { claimsCreated: 12, verified: 5, draftsReplaced: 9 } }),
    doc(1, { outcome: "denied", action: "Access denied", claimId: null, detail: "incoming_developer tried GET /api/audit" }),
  ];
  const res = await get("/api/audit/events?limit=2", "lead");
  assert.equal(res.status, 200);
  assert.equal(lastLimit, 3); // one more than asked, to know whether another page exists
  assert.equal(res.body.rows.length, 2);
  assert.equal(res.body.nextCursor, hex(2));
  assert.deepEqual(res.body.rows[0], {
    id: hex(3), at: "2026-11-14T10:00:03", actor: "Demo Lead", role: "lead",
    action: "Accepted", outcome: "allowed", claimId: "c_001", detail: "Team claim",
  });
  assert.equal(res.body.rows[1].action, "Extraction run");
  assert.equal(res.body.rows[1].detail, "12 claims created, 5 verified, 9 drafts replaced");
});

test("the last page has a null cursor, and a denied row says so", async () => {
  reset();
  docs = [doc(1, { outcome: "denied", action: "Access denied", claimId: null, detail: "x tried GET /api/audit" })];
  const res = await get("/api/audit/events", "lead");
  assert.equal(res.body.nextCursor, null);
  assert.equal(res.body.rows[0].outcome, "denied");
  assert.equal(lastLimit, 51); // default 50, plus one
});

test("the limit is capped at 200", async () => {
  reset();
  await get("/api/audit/events?limit=999", "lead");
  assert.equal(lastLimit, 201);
});

test("filters reach the database query", async () => {
  reset();
  await get("/api/audit/events?outcome=denied&claimId=c_001", "lead");
  assert.deepEqual(lastFilter, { $and: [{ claimId: "c_001" }, { outcome: "denied" }] });
  await get("/api/audit/events?action=Extraction%20run", "lead");
  assert.deepEqual(lastFilter, { $and: [{ action: "extract" }] });
});

test("bad input is a 400 and never reaches the database", async () => {
  reset();
  for (const q of ["limit=0", "limit=abc", "from=2026-13-01", "to=yesterday", "outcome=maybe", "claimId=bad", "before=nope", "nope=1", "actor[$ne]=x"]) {
    const res = await get("/api/audit/events?" + q, "lead");
    assert.equal(res.status, 400, q);
    assert.equal(typeof res.body.error, "string");
  }
  assert.equal(findCalls, 0);
});

test("an unknown cursor is a 400", async () => {
  reset();
  cursorRow = null;
  const res = await get("/api/audit/events?before=" + hex(999), "lead");
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "Unknown cursor");
});

test("only the reviewer can read events; a refusal is logged without the query string; no token is a 401 and is not logged", async () => {
  reset();
  assert.equal((await get("/api/audit/events")).status, 401);
  await settle();
  assert.equal(created.length, 0);

  for (const role of ["incoming_lead", "incoming_developer"]) {
    const res = await get("/api/audit/events?actor=SECRETNAME", role);
    assert.equal(res.status, 403);
  }
  await settle();
  const denied = created.filter((r) => r.outcome === "denied" && r.action === "Access denied");
  assert.equal(denied.length, 2);
  for (const r of denied) {
    assert.ok(r.detail.includes("/api/audit/events"));
    assert.ok(!JSON.stringify(r).includes("SECRETNAME"));
  }
  assert.equal(findCalls, 0);
});

test("the original GET /api/audit keeps its shape for the live client", async () => {
  reset();
  docs = [doc(1)];
  const res = await get("/api/audit", "lead");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [{ at: "2026-11-14T10:00:01", actor: "Demo Lead", action: "Accepted", detail: "Team claim" }]);
});