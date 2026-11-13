// Conflict resolution and gap answers through the real app, real JWT and real
// permission code. Only the database models are replaced by small in-memory stubs.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const Claim = require("../src/models/Claim");
const Chunk = require("../src/models/Chunk");
const Source = require("../src/models/Source");
const Counter = require("../src/models/Counter");
const AuditLog = require("../src/models/AuditLog");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

const stored = (claimId, o = {}) => ({
  claimId, type: "decision", subject: null, statement: "Statement " + claimId, status: "uncertain",
  baseStatus: "uncertain", visibility: "team", evidence: [], nextAction: null, conflictsWith: [],
  inference: false, review: { state: "draft", reviewerId: null, at: null }, ...o,
});
const fixtures = () => [
  stored("c_001", { status: "conflicting", baseStatus: "verified", conflictsWith: ["c_002"] }),
  stored("c_002", { status: "conflicting", baseStatus: "uncertain", conflictsWith: ["c_001"] }),
  stored("c_003", { type: "ownership", statement: "Who owns the deploy script?", status: "missing", inference: true }),
  stored("c_004", { type: "ownership", statement: "Priya owns billing", status: "uncertain", visibility: "lead_only", inference: true }),
  stored("c_005", { statement: "Where is the vault key kept?", status: "missing", visibility: "restricted", inference: true }),
  stored("c_006", { status: "verified", baseStatus: "verified" }),
];

const chain = (result) => {
  const c = { sort: () => c, populate: () => c, lean: () => c, select: () => c, limit: () => c,
    then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  return c;
};

let live, chunks, sourceCalls, audits, counterSeq, bulkOps;
function reset() {
  live = fixtures();
  chunks = [];
  sourceCalls = [];
  audits = [];
  counterSeq = 6;
  bulkOps = [];
}

const matches = (c, f = {}) => {
  if (typeof f.claimId === "string") return c.claimId === f.claimId;
  if (f.claimId && f.claimId.$in) return f.claimId.$in.includes(c.claimId);
  if (f["conflictsWith.0"]) return c.conflictsWith.length > 0;
  return true;
};
Claim.find = (f) => chain(structuredClone(live.filter((c) => matches(c, f))));
Claim.findOne = (f) => chain(structuredClone(live.find((c) => matches(c, f))) || null);
Claim.deleteOne = async (f) => { live = live.filter((c) => c.claimId !== f.claimId); };
Claim.create = async (d) => {
  const evidence = d.evidence.map((e) => ({ ...e, chunkId: chunks.find((ch) => String(ch._id) === String(e.chunkId)) }));
  live.push({ ...structuredClone({ ...d, evidence: [] }), evidence });
};
Claim.bulkWrite = async (ops) => {
  bulkOps = ops;
  for (const { updateOne } of ops) {
    const c = live.find((x) => x.claimId === updateOne.filter.claimId);
    const set = updateOne.update.$set;
    c.status = set.status;
    c.conflictsWith = set.conflictsWith;
    if (set["review.state"]) c.review = { state: set["review.state"], reviewerId: { name: "Name lead" }, at: set["review.at"] };
  }
};
Source.findOneAndUpdate = async (filter, update) => {
  sourceCalls.push({ filter, update });
  return { _id: filter.name, name: filter.name };
};
Chunk.findOne = (f) => chain(chunks.filter((c) => c.sourceId.name === f.sourceId).sort((a, b) => b.n - a.n)[0] || null);
Chunk.create = async (d) => {
  const chunk = { _id: "ch" + chunks.length, n: d.n, text: d.text, ref: d.ref, sensitivity: d.sensitivity,
    timestamp: d.timestamp, sourceId: { name: d.sourceId, createdAt: d.timestamp } };
  chunks.push(chunk);
  return chunk;
};
Counter.findOneAndUpdate = async () => ({ seq: ++counterSeq });
AuditLog.create = async (d) => { audits.push(structuredClone(d)); };

const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: "Name " + role });
const call = (method, path, role, body) => {
  let r = request(app)[method](path);
  if (role) r = r.set("Authorization", "Bearer " + tokenFor(role));
  return body === undefined ? r : r.send(body);
};
const INCOMING = ["incoming_lead", "incoming_developer"];

test("resolve: the kept claim is accepted at the status its evidence earned, the other is rejected", async () => {
  reset();
  const res = await call("post", "/api/claims/resolve", "lead", { keepId: "c_001", dropId: "c_002" });
  assert.equal(res.status, 200);
  const byId = Object.fromEntries(res.body.claims.map((c) => [c.id, c]));
  assert.equal(byId.c_001.review.state, "accepted");
  assert.equal(byId.c_001.status, "verified"); // its own baseStatus, not an upgrade
  assert.deepEqual(byId.c_001.conflictsWith, []);
  assert.equal(byId.c_002.review.state, "rejected");
  assert.equal(byId.c_002.status, "uncertain");
  assert.equal(bulkOps.length, 2);
  assert.equal(audits.at(-1).action, "Conflict resolved");
  assert.equal(audits.at(-1).detail, "Kept: Statement c_001 Set aside: Statement c_002");
});

test("resolve: the resolution log lists it, reviewer only", async () => {
  reset();
  AuditLog.find = () => chain([
    { at: new Date("2026-03-02T12:00:00Z"), actorId: { name: "Name lead" }, action: "Conflict resolved",
      after: { keepId: "c_001", dropId: "c_002", keepStatement: "A", dropStatement: "B" } },
  ]);
  assert.equal((await call("get", "/api/claims/resolutions")).status, 401);
  for (const role of INCOMING) assert.equal((await call("get", "/api/claims/resolutions", role)).status, 403);
  const res = await call("get", "/api/claims/resolutions", "lead");
  assert.deepEqual(res.body, [{ keepId: "c_001", dropId: "c_002", keepStatement: "A", dropStatement: "B", by: "Name lead", at: "2026-03-02T12:00:00" }]);
});

test("resolve: wrong roles and bad input are refused before anything is written", async () => {
  reset();
  assert.equal((await call("post", "/api/claims/resolve", undefined, { keepId: "c_001", dropId: "c_002" })).status, 401);
  for (const role of INCOMING) {
    assert.equal((await call("post", "/api/claims/resolve", role, { keepId: "c_001", dropId: "c_002" })).status, 403);
  }
  for (const body of [undefined, {}, { keepId: "c_001" }, { keepId: "x", dropId: "c_002" }]) {
    assert.equal((await call("post", "/api/claims/resolve", "lead", body)).status, 400);
  }
  assert.equal((await call("post", "/api/claims/resolve", "lead", { keepId: "c_001", dropId: "c_001" })).status, 400);
  assert.equal((await call("post", "/api/claims/resolve", "lead", { keepId: "c_001", dropId: "c_006" })).status, 409);
  assert.equal((await call("post", "/api/claims/resolve", "lead", { keepId: "c_001", dropId: "c_999" })).status, 409);
  assert.equal(bulkOps.length, 0);
  assert.equal(audits.length, 0);
});

test("answer: becomes a new draft claim with redacted text and an informal answer source", async () => {
  reset();
  const res = await call("post", "/api/claims/c_003/answer", "lead", {
    answer: "Ravi owns it. Call 98765 43210. The password is hunter2abc.",
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.replaced, "c_003");
  assert.equal(res.body.claim.id, "c_007");
  assert.ok(res.body.claim.statement.startsWith("Who owns the deploy script? Answer: Ravi owns it."));
  assert.ok(!JSON.stringify(res.body).includes("hunter2abc"));
  assert.ok(!JSON.stringify(res.body).includes("98765"));
  assert.equal(res.body.redacted.total, 2);
  assert.equal(res.body.claim.status, "uncertain");
  assert.equal(res.body.claim.review.state, "draft");
  assert.equal(res.body.claim.inference, false);
  assert.equal(res.body.claim.type, "ownership");
  assert.equal(res.body.claim.visibility, "team");
  assert.equal(res.body.claim.evidence[0].source, "Answer from departing member");
  assert.ok(!live.some((c) => c.claimId === "c_003")); // the question is replaced
  assert.equal(sourceCalls[0].update.$setOnInsert.formality, "informal");
  assert.ok(!chunks[0].text.includes("hunter2abc")); // nothing unmasked was ever stored
  assert.equal(audits.at(-1).action, "Gap answered");
  assert.ok(audits.at(-1).detail.endsWith("(2 redacted)"));
});

test("answer: a lead-only question keeps its tier, and a second answer takes the next chunk number", async () => {
  reset();
  const first = await call("post", "/api/claims/c_004/answer", "lead", { answer: "Yes, Priya." });
  assert.equal(first.status, 201);
  assert.equal(first.body.claim.visibility, "lead_only");
  assert.ok(first.body.claim.statement.startsWith("Is this correct? Priya owns billing Answer: Yes, Priya."));
  assert.equal(first.body.claim.evidence[0].source, "Answer from departing member (lead only)");
  assert.equal(sourceCalls[0].update.$setOnInsert.sensitivity, "lead_only");

  const second = await call("post", "/api/claims/c_003/answer", "lead", { answer: "Ravi." });
  assert.equal(second.status, 201);
  assert.equal(second.body.claim.evidence[0].chunk, 1); // a different source, so it starts at 1
  assert.equal(chunks.length, 2);
});

test("answer: only open, non-restricted questions can be answered, and only by the reviewer", async () => {
  reset();
  assert.equal((await call("post", "/api/claims/c_003/answer", undefined, { answer: "x" })).status, 401);
  for (const role of INCOMING) {
    assert.equal((await call("post", "/api/claims/c_003/answer", role, { answer: "x" })).status, 403);
  }
  assert.equal((await call("post", "/api/claims/c_005/answer", "lead", { answer: "x" })).status, 400); // restricted
  assert.equal((await call("post", "/api/claims/c_006/answer", "lead", { answer: "x" })).status, 400); // not a gap
  assert.equal((await call("post", "/api/claims/c_999/answer", "lead", { answer: "x" })).status, 404);
  assert.equal((await call("post", "/api/claims/not-an-id/answer", "lead", { answer: "x" })).status, 404);
  for (const body of [undefined, {}, { answer: "" }, { answer: "   " }, { answer: "a".repeat(2001) }]) {
    assert.equal((await call("post", "/api/claims/c_003/answer", "lead", body)).status, 400);
  }
  assert.equal(live.length, 6);
  assert.equal(chunks.length, 0);
  assert.equal(audits.length, 0);
});
