// Step S4.4: restoring the demo data. No real database: the models are small fakes that record
// what was asked of them, so the order of operations and the user remapping are what is tested.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const mongoose = require("mongoose");
const { EJSON, ObjectId } = mongoose.mongo.BSON;
const demo = require("../src/services/demoRestore");
const audit = require("../src/models/AuditLog");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

// ---- A snapshot with every kind of user reference ---------------------------------
const OLD = { lead: new ObjectId(), incLead: new ObjectId(), dev: new ObjectId(), ghost: new ObjectId() };
const NEW = { lead: new ObjectId(), incLead: new ObjectId(), dev: new ObjectId() };
const USERS = [
  { _id: NEW.lead, role: "lead" }, { _id: NEW.incLead, role: "incoming_lead" }, { _id: NEW.dev, role: "incoming_developer" },
];
const chunkId = new ObjectId();
const sourceId = new ObjectId();
const at = new Date("2026-03-02T18:40:00Z");

const snapshotObject = (extra = {}) => ({
  exportedAt: "2026-11-15T10:00:00.000Z",
  userRoles: { [String(OLD.lead)]: "lead", [String(OLD.incLead)]: "incoming_lead", [String(OLD.dev)]: "incoming_developer" },
  collections: {
    Claim: [{
      _id: new ObjectId(), claimId: "c_001", statement: "x",
      evidence: [{ chunkId, quote: "q" }],
      review: {
        state: "edited", reviewerId: OLD.lead, at, reason: null,
        override: { reason: "ok", byId: OLD.lead, at },
        history: [{ at, byId: OLD.lead, action: "edit", by: "Demo Lead" }],
      },
    }, { _id: new ObjectId(), claimId: "c_002", statement: "y", review: { state: "draft", reviewerId: null, at: null } }],
    Source: [{ _id: sourceId, name: "notes.md", uploadedBy: OLD.lead }],
    Chunk: [{ _id: chunkId, sourceId, n: 1, text: "t" }],
    Version: [{ _id: new ObjectId(), number: 1, by: OLD.lead, byName: "Demo Lead", at, claims: [{ id: "c_001", review: { by: "Demo Lead" } }] }],
    Handover: [{ _id: "handover", approvedVersion: 1, acknowledgements: {
      incoming_lead: { at, userId: OLD.incLead }, incoming_developer: { at, userId: OLD.dev } } }],
    Counter: [{ _id: "claim", seq: 2 }],
    AuditLog: [
      { _id: new ObjectId(), actorId: OLD.lead, action: "Accepted" },
      { _id: new ObjectId(), actorId: OLD.dev, action: "Access denied", outcome: "denied" },
      { _id: new ObjectId(), actorId: OLD.ghost, action: "Old row from a deleted user" },
    ],
    ...extra,
  },
});
const asText = (obj) => EJSON.stringify(obj, { relaxed: false }, 2);

// ---- parse ------------------------------------------------------------------------
test("a saved snapshot comes back with real ObjectIds and dates", () => {
  const parsed = demo.parseSnapshot(asText(snapshotObject()));
  const claim = parsed.collections.Claim[0];
  assert.ok(claim._id instanceof ObjectId);
  assert.ok(claim.review.at instanceof Date);
  assert.ok(claim.review.reviewerId instanceof ObjectId);
  assert.equal(parsed.exportedAt, "2026-11-15T10:00:00.000Z");
});

test("bad snapshots are refused with a readable message", () => {
  const bad = [
    ["not json", "{ nope", /not valid JSON/],
    ["no collections", "{}", /no "collections"/],
    ["a missing list", asText({ collections: { Claim: [{ a: 1 }] } }), /no Source list/],
    ["a list that is not a list", asText(snapshotObject({ Chunk: "oops" })), /no Chunk list/],
    ["no claims", asText(snapshotObject({ Claim: [] })), /no claims/],
    ["no sources", asText(snapshotObject({ Source: [] })), /no sources/],
    ["a bad audit list", asText(snapshotObject({ AuditLog: 5 })), /AuditLog is not a list/],
  ];
  for (const [label, text, pattern] of bad) {
    assert.throws(() => demo.parseSnapshot(text), (err) => err instanceof demo.SnapshotError && pattern.test(err.message), label);
  }
});

test("an old snapshot without an audit list is accepted and leaves the audit trail alone", () => {
  const obj = snapshotObject();
  delete obj.collections.AuditLog;
  const prepared = demo.prepare(demo.parseSnapshot(asText(obj)), USERS);
  assert.equal(prepared.AuditLog, undefined);
});

// ---- remapping user references ----------------------------------------------------
const prepared = () => demo.prepare(demo.parseSnapshot(asText(snapshotObject())), USERS);
const same = (a, b) => String(a) === String(b);

test("reviewer, override, history, uploader and approver all point at today's lead", () => {
  const p = prepared();
  const claim = p.Claim[0];
  assert.ok(same(claim.review.reviewerId, NEW.lead));
  assert.ok(same(claim.review.override.byId, NEW.lead));
  assert.ok(same(claim.review.history[0].byId, NEW.lead));
  assert.ok(same(p.Source[0].uploadedBy, NEW.lead));
  assert.ok(same(p.Version[0].by, NEW.lead));
});

test("acknowledgements go to the user of that role, by the role key", () => {
  const ack = prepared().Handover[0].acknowledgements;
  assert.ok(same(ack.incoming_lead.userId, NEW.incLead));
  assert.ok(same(ack.incoming_developer.userId, NEW.dev));
});

test("audit rows go to the user with the old user's role, and unknown actors fall back to the lead", () => {
  const rows = prepared().AuditLog;
  assert.ok(same(rows[0].actorId, NEW.lead));
  assert.ok(same(rows[1].actorId, NEW.dev));
  assert.ok(same(rows[2].actorId, NEW.lead));
});

test("record ids, links between records, names, nulls and dates are left exactly alone", () => {
  const original = demo.parseSnapshot(asText(snapshotObject()));
  const p = demo.prepare(original, USERS);
  assert.ok(same(p.Claim[0]._id, original.collections.Claim[0]._id));
  assert.ok(same(p.Claim[0].evidence[0].chunkId, chunkId));
  assert.ok(same(p.Chunk[0].sourceId, sourceId));
  assert.equal(p.Claim[1].review.reviewerId, null);
  assert.equal(p.Version[0].claims[0].review.by, "Demo Lead"); // a name, not an id
  assert.equal(p.Version[0].byName, "Demo Lead");
  assert.equal(p.Claim[0].review.at.getTime(), at.getTime());
  assert.equal(p.Handover[0]._id, "handover");
});

test("preparing never changes the parsed snapshot", () => {
  const original = demo.parseSnapshot(asText(snapshotObject()));
  const before = asText(original);
  demo.prepare(original, USERS);
  assert.equal(asText(original), before);
});

test("without a lead account the restore refuses to start", () => {
  const onlyIncoming = USERS.filter((u) => u.role !== "lead");
  assert.throws(() => demo.prepare(demo.parseSnapshot(asText(snapshotObject())), onlyIncoming), /no lead account/i);
});

test("a snapshot without userRoles still restores: everything goes to the lead", () => {
  const obj = snapshotObject();
  delete obj.userRoles;
  const p = demo.prepare(demo.parseSnapshot(asText(obj)), USERS);
  assert.ok(same(p.AuditLog[1].actorId, NEW.lead));
  assert.ok(same(p.Handover[0].acknowledgements.incoming_lead.userId, NEW.incLead)); // the role key still works
});

// ---- writing ----------------------------------------------------------------------
function fakeModels(log) {
  const models = { User: { find: () => ({ select: () => ({ lean: async () => USERS }) }) } };
  for (const name of [...demo.REQUIRED, ...demo.OPTIONAL]) {
    models[name] = { collection: {
      deleteMany: async (f, o) => { log.push(["delete", name, Boolean(o && o.session)]); },
      insertMany: async (docs, o) => { log.push(["insert", name, docs.length, Boolean(o && o.session)]); },
    } };
  }
  return models;
}
const fakeDb = (withTransaction) => ({ startSession: async () => ({ withTransaction, endSession: async () => {} }) });
const TEXT = asText(snapshotObject());

test("it clears and refills each collection, inside a transaction when there is one", async () => {
  const log = [];
  const result = await demo.restoreDemo({ models: fakeModels(log), text: TEXT, db: fakeDb((fn) => fn()) });
  assert.equal(result.transactional, true);
  assert.deepEqual(result.counts, { Claim: 2, Source: 1, Chunk: 1, Version: 1, Handover: 1, Counter: 1, AuditLog: 3 });
  for (const name of Object.keys(result.counts)) {
    const d = log.findIndex((e) => e[0] === "delete" && e[1] === name);
    const i = log.findIndex((e) => e[0] === "insert" && e[1] === name);
    assert.ok(d > -1 && i > d, name + ": delete must come before insert");
  }
  assert.ok(log.every((e) => e[e.length - 1] === true), "every write should carry the session");
});

test("on a database with no transactions it falls back to plain writes and says so", async () => {
  const log = [];
  let attempts = 0;
  const db = fakeDb(async () => { attempts += 1; throw new Error("Transaction numbers are only allowed on a replica set member or mongos"); });
  const result = await demo.restoreDemo({ models: fakeModels(log), text: TEXT, db });
  assert.equal(attempts, 1);
  assert.equal(result.transactional, false);
  assert.equal(log.filter((e) => e[0] === "insert").length, 7);
  assert.ok(log.every((e) => e[e.length - 1] === false), "the fallback must not use a session");
});

test("any other failure is not swallowed and nothing is retried without a transaction", async () => {
  const log = [];
  const db = fakeDb(async () => { throw new Error("disk full"); });
  await assert.rejects(demo.restoreDemo({ models: fakeModels(log), text: TEXT, db }), /disk full/);
  assert.equal(log.length, 0);
});

test("an empty collection is cleared but not inserted, and a missing audit list is not touched", async () => {
  const obj = snapshotObject({ Chunk: [] });
  delete obj.collections.AuditLog;
  const log = [];
  await demo.restoreDemo({ models: fakeModels(log), text: asText(obj), db: fakeDb((fn) => fn()) });
  assert.ok(log.some((e) => e[0] === "delete" && e[1] === "Chunk"));
  assert.ok(!log.some((e) => e[0] === "insert" && e[1] === "Chunk"));
  assert.ok(!log.some((e) => e[1] === "AuditLog"));
});

test("a bad snapshot stops before anything is written", async () => {
  const log = [];
  await assert.rejects(demo.restoreDemo({ models: fakeModels(log), text: "{ nope", db: fakeDb((fn) => fn()) }), demo.SnapshotError);
  assert.equal(log.length, 0);
});

// ---- the reset endpoint -----------------------------------------------------------
const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: role });
const post = (role, body) => {
  let r = request(app).post("/api/demo/reset");
  if (role) r = r.set("Authorization", "Bearer " + tokenFor(role));
  return r.send(body);
};
const realRestore = demo.restoreDemo;
const realLoad = demo.loadSnapshotText;
let audits;
audit.create = async (d) => { audits.push(d); };
test.beforeEach(() => { audits = []; });
test.afterEach(() => {
  demo.restoreDemo = realRestore;
  demo.loadSnapshotText = realLoad;
  delete process.env.ALLOW_DEMO_RESET;
});

test("the reset endpoint does not exist unless ALLOW_DEMO_RESET is true", async () => {
  for (const role of ["lead", "incoming_lead", undefined]) {
    const res = await post(role, { confirm: "restore" });
    assert.equal(res.status, 404, String(role));
    assert.deepEqual(res.body, { error: "Not found" });
  }
});

test("when enabled: only the lead, and only with the confirmation word", async () => {
  process.env.ALLOW_DEMO_RESET = "true";
  assert.equal((await post(undefined, { confirm: "restore" })).status, 401);
  assert.equal((await post("incoming_developer", { confirm: "restore" })).status, 403);
  assert.equal((await post("lead", {})).status, 400);
  assert.equal((await post("lead", { confirm: "yes" })).status, 400);
});

test("a successful reset reports counts and leaves one audit row", async () => {
  process.env.ALLOW_DEMO_RESET = "true";
  demo.loadSnapshotText = () => "snapshot text";
  demo.restoreDemo = async ({ text }) => {
    assert.equal(text, "snapshot text");
    return { counts: { Claim: 24, Source: 5 }, transactional: true };
  };
  const res = await post("lead", { confirm: "restore" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, claims: 24, sources: 5, transactional: true });
  assert.equal(audits.filter((a) => a.action === "Demo data restored").length, 1);
});

test("no snapshot file is a clean 404, a damaged one is a 422, and nothing is half done", async () => {
  process.env.ALLOW_DEMO_RESET = "true";
  demo.loadSnapshotText = () => { throw new demo.SnapshotError("No snapshot file at x"); };
  assert.equal((await post("lead", { confirm: "restore" })).status, 404);
  demo.loadSnapshotText = () => "text";
  demo.restoreDemo = async () => { throw new demo.SnapshotError("The snapshot has no claims. Refusing to restore it."); };
  const res = await post("lead", { confirm: "restore" });
  assert.equal(res.status, 422);
  assert.match(res.body.error, /no claims/);
  assert.equal(audits.filter((a) => a.action === "Demo data restored").length, 0);
});

test("two resets at the same moment: one runs, the other is a 409", async () => {
  process.env.ALLOW_DEMO_RESET = "true";
  demo.loadSnapshotText = () => "text";
  demo.restoreDemo = async () => { await new Promise((r) => setTimeout(r, 30)); return { counts: { Claim: 1, Source: 1 }, transactional: true }; };
  const results = await Promise.all([post("lead", { confirm: "restore" }), post("lead", { confirm: "restore" })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(audits.filter((a) => a.action === "Demo data restored").length, 1);
});