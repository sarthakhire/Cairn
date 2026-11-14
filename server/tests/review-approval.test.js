// Review, approval, acknowledgement, source-list and audit routes. Real app, real JWT,
// real permission code; only the database models are replaced by small in-memory stubs.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const Claim = require("../src/models/Claim");
const Handover = require("../src/models/Handover");
const Version = require("../src/models/Version");
const AuditLog = require("../src/models/AuditLog");
const Source = require("../src/models/Source");
const Chunk = require("../src/models/Chunk");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

const SECRETS = { restricted: "FAKE_KEY_abc123", leadOnly: "LEADONLY_BUDGET_TALK", draft: "DRAFT_ONLY_TEXT" };

const chunk = (n, name) => ({ n, timestamp: new Date("2026-02-03T00:00:00Z"), sourceId: { name } });
const stored = (claimId, visibility, state, statement, quote) => ({
  claimId, type: "decision", statement, status: "uncertain", visibility,
  // Found quote with a yes from the support check, so these claims are "verified" and never block approval.
  evidence: [{ quote, quoteFound: true, supportsStatement: true, chunkId: chunk(1, "src.md") }],
  review: { state, reviewerId: state === "draft" ? null : { name: "Lead" }, at: null },
  nextAction: null, conflictsWith: [], inference: false,
});
const fixtures = () => [
  stored("c_001", "team", "accepted", "Team claim", "a quote long enough to count"),
  stored("c_002", "lead_only", "accepted", SECRETS.leadOnly, SECRETS.leadOnly + " in the notes"),
  stored("c_003", "restricted", "accepted", "Key is " + SECRETS.restricted, "the key is " + SECRETS.restricted),
  stored("c_004", "team", "draft", SECRETS.draft, SECRETS.draft + " quote here"),
  stored("c_005", "team", "rejected", "Rejected claim " + SECRETS.draft, SECRETS.draft + " again"),
];

const chain = (result) => {
  const c = { sort: () => c, populate: () => c, lean: () => c, select: () => c, limit: () => c,
    then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  return c;
};

let live, handoverState, versions, audits, claimUpdates, handoverUpdates;

function reset() {
  live = fixtures();
  handoverState = null;
  versions = [];
  audits = [];
  claimUpdates = [];
  handoverUpdates = 0;
}

Claim.find = (filter) =>
  chain(structuredClone(live.filter((c) => !filter || !filter.claimId || c.claimId === filter.claimId)));
Claim.updateOne = async (filter, update) => {
  claimUpdates.push(structuredClone(update));
  const c = live.find((x) => x.claimId === filter.claimId);
  const set = update.$set;
  if (set.statement) c.statement = set.statement;
  c.review = { state: set["review.state"], reviewerId: { name: "Lead" }, at: set["review.at"] };
  return { matchedCount: 1 };
};
AuditLog.create = async (d) => { audits.push(structuredClone(d)); };
Handover.findById = () => chain(handoverState && structuredClone(handoverState));
Handover.updateOne = async (filter, update) => {
  const needsApproved = filter.approvedVersion && filter.approvedVersion.$ne === null;
  if (needsApproved && (!handoverState || handoverState.approvedVersion == null)) return { matchedCount: 0 };
  handoverUpdates += 1;
  handoverState = handoverState || { _id: "handover", approvedVersion: null, acknowledgements: {} };
  for (const [k, v] of Object.entries(update.$set)) {
    if (k.startsWith("acknowledgements.")) handoverState.acknowledgements[k.split(".")[1]] = v;
    else handoverState[k] = v;
  }
  return { matchedCount: 1 };
};
Version.findOne = (filter) =>
  chain(structuredClone(filter && filter.number != null ? versions.find((v) => v.number === filter.number) : versions[versions.length - 1]));
Version.find = () => chain(structuredClone(versions));
Version.create = async (d) => {
  if (versions.some((v) => v.number === d.number)) throw Object.assign(new Error("dup"), { code: 11000 });
  versions.push(structuredClone(d));
};

const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: "Name " + role });
const call = (method, path, role, body) => {
  let r = request(app)[method](path);
  if (role) r = r.set("Authorization", "Bearer " + tokenFor(role));
  return body === undefined ? r : r.send(body);
};
const ids = (res) => res.body.map((c) => c.id);
const INCOMING = ["incoming_lead", "incoming_developer"];

// Approval is blocked while any claim is a draft, so tests that approve settle the draft first.
// A rejected claim is hidden from incoming roles exactly like a draft, so the leak checks still mean the same.
const settle = () => {
  for (const c of live) {
    if (c.review.state === "draft") c.review = { state: "rejected", reviewerId: { name: "Lead" }, at: null };
  }
};

test("incoming roles see nothing until a version is approved", async () => {
  reset();
  for (const role of INCOMING) {
    const list = await call("get", "/api/claims", role);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, []);
    assert.equal((await call("get", "/api/claims/c_001", role)).status, 404);
    const state = await call("get", "/api/approval", role);
    assert.deepEqual(state.body, { approval: null, acknowledgements: {} });
  }
  assert.equal((await call("get", "/api/claims", "lead")).body.length, 5);
});

test("approve saves a version, incoming roles see that snapshot, later edits stay hidden until re-approval", async () => {
  reset();
  settle();
  const approved = await call("post", "/api/approval", "lead");
  assert.equal(approved.status, 201);
  assert.equal(approved.body.approval.version, 1);
  assert.equal(approved.body.approval.by, "Name lead");
  assert.equal(approved.body.versions.length, 1);
  assert.equal(approved.body.versions[0].summary.total, 5);
  assert.equal(approved.body.versions[0].summary.draft, 0);
  assert.deepEqual(approved.body.versions[0].summary.warnings, { partial: 0, uncertain: 3, missing: 0, conflicting: 0 });
  assert.equal(audits.at(-1).action, "Handover approved");
  assert.equal(audits.at(-1).detail, "Version 1. Warnings: 0 partial, 3 uncertain, 0 missing, 0 conflicting.");

  assert.deepEqual(ids(await call("get", "/api/claims", "incoming_lead")), ["c_001", "c_002", "c_003"]);
  assert.deepEqual(ids(await call("get", "/api/claims", "incoming_developer")), ["c_001", "c_003"]);

  const edit = await call("patch", "/api/claims/c_001", "lead", { action: "edit", statement: "New wording" });
  assert.equal(edit.status, 200);
  const stillOld = await call("get", "/api/claims/c_001", "incoming_developer");
  assert.equal(stillOld.body.statement, "Team claim");
  assert.equal((await call("get", "/api/approval", "lead")).body.changedCount, 1);

  const second = await call("post", "/api/approval", "lead");
  assert.equal(second.body.approval.version, 2);
  assert.equal(second.body.changedCount, 0);
  assert.equal((await call("get", "/api/claims/c_001", "incoming_developer")).body.statement, "New wording");
});

test("the snapshot never leaks restricted, lead-only or draft text to the wrong role", async () => {
  reset();
  settle();
  assert.equal((await call("post", "/api/approval", "lead")).status, 201);

  const dev = JSON.stringify([
    (await call("get", "/api/claims", "incoming_developer")).body,
    (await call("get", "/api/approval", "incoming_developer")).body,
  ]);
  for (const s of Object.values(SECRETS)) assert.ok(!dev.includes(s), "developer saw " + s);

  const lead = JSON.stringify((await call("get", "/api/claims", "incoming_lead")).body);
  assert.ok(lead.includes(SECRETS.leadOnly));
  assert.ok(!lead.includes(SECRETS.restricted));
  assert.ok(!lead.includes(SECRETS.draft));

  const incomingState = JSON.stringify((await call("get", "/api/approval", "incoming_lead")).body);
  assert.ok(!incomingState.includes("versions"));
  assert.ok(!incomingState.includes(SECRETS.restricted));
});

test("only the reviewer can approve or revoke; revoke hides everything again", async () => {
  reset();
  settle();
  assert.equal((await call("post", "/api/approval")).status, 401);
  for (const role of INCOMING) {
    assert.equal((await call("post", "/api/approval", role)).status, 403);
    assert.equal((await call("delete", "/api/approval", role)).status, 403);
  }
  assert.equal((await call("delete", "/api/approval", "lead")).status, 409); // nothing to revoke

  await call("post", "/api/approval", "lead");
  const revoked = await call("delete", "/api/approval", "lead");
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.approval, null);
  assert.equal(audits.at(-1).action, "Approval revoked");
  assert.deepEqual((await call("get", "/api/claims", "incoming_lead")).body, []);
  assert.equal(revoked.body.versions.length, 1); // the version itself is kept
});

test("review: accept and reject set the state and write an audit row", async () => {
  reset();
  const accepted = await call("patch", "/api/claims/c_004", "lead", { action: "accept" });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.review.state, "accepted");
  assert.equal(accepted.body.review.by, "Lead");
  assert.deepEqual(Object.keys(claimUpdates[0].$set).sort(), ["review.at", "review.reviewerId", "review.state"]);
  assert.equal(audits.at(-1).action, "Accepted");
  assert.equal(audits.at(-1).claimId, "c_004");

  const rejected = await call("patch", "/api/claims/c_001", "lead", { action: "reject" });
  assert.equal(rejected.body.review.state, "rejected");
  assert.equal(audits.at(-1).action, "Rejected");
});

test("review: an edit changes only the statement and review, never status or evidence", async () => {
  reset();
  const before = (await call("get", "/api/claims/c_004", "lead")).body;
  const res = await call("patch", "/api/claims/c_004", "lead", { action: "edit", statement: "  Fixed wording  " });
  assert.equal(res.status, 200);
  assert.equal(res.body.statement, "Fixed wording");
  assert.equal(res.body.review.state, "edited");
  assert.equal(res.body.status, before.status);
  assert.deepEqual(res.body.evidence, before.evidence);
  const keys = Object.keys(claimUpdates[0].$set);
  assert.ok(keys.includes("statement"));
  assert.ok(!keys.some((k) => k === "status" || k.startsWith("evidence")));
  assert.equal(audits.at(-1).action, "Edited");
  assert.ok(audits.at(-1).detail.startsWith("From: "));
});

test("review: bad input and wrong roles are rejected before anything is written", async () => {
  reset();
  assert.equal((await call("patch", "/api/claims/c_004", undefined, { action: "accept" })).status, 401);
  for (const role of INCOMING) {
    assert.equal((await call("patch", "/api/claims/c_004", role, { action: "accept" })).status, 403);
  }
  const bad = [undefined, {}, { action: "delete" }, { action: "edit" }, { action: "edit", statement: "   " }];
  for (const body of bad) {
    assert.equal((await call("patch", "/api/claims/c_004", "lead", body)).status, 400);
  }
  assert.equal((await call("patch", "/api/claims/c_001", "lead", { action: "edit", statement: "Team claim" })).status, 400);
  assert.equal((await call("patch", "/api/claims/c_999", "lead", { action: "accept" })).status, 404);
  assert.equal((await call("patch", "/api/claims/not-an-id", "lead", { action: "accept" })).status, 404);
  assert.equal(claimUpdates.length, 0);
  assert.equal(audits.length, 0);
});

test("acknowledge: only incoming roles, only after approval, first time is kept", async () => {
  reset();
  settle();
  assert.equal((await call("post", "/api/approval/acknowledge", "incoming_developer")).status, 409);
  assert.equal((await call("post", "/api/approval/acknowledge", "lead")).status, 403);
  assert.equal((await call("post", "/api/approval/acknowledge")).status, 401);

  await call("post", "/api/approval", "lead");
  const first = await call("post", "/api/approval/acknowledge", "incoming_developer");
  assert.equal(first.status, 200);
  assert.equal(typeof first.body.acknowledgements.incoming_developer.at, "string");
  assert.equal(audits.at(-1).action, "Acknowledged");

  const writes = handoverUpdates;
  const auditRows = audits.length;
  await call("post", "/api/approval/acknowledge", "incoming_developer");
  assert.equal(handoverUpdates, writes); // second click writes nothing
  assert.equal(audits.length, auditRows); // and adds no audit row

  const lead = await call("get", "/api/approval", "lead");
  assert.deepEqual(Object.keys(lead.body.acknowledgements), ["incoming_developer"]);
  const other = await call("get", "/api/approval", "incoming_lead");
  assert.deepEqual(other.body.acknowledgements, {}); // one role never sees the other's receipt

  // A new version clears receipts. Something must change first, or approval says "nothing changed".
  await call("patch", "/api/claims/c_001", "lead", { action: "edit", statement: "Reworded after approval" });
  assert.equal((await call("post", "/api/approval", "lead")).status, 201);
  assert.deepEqual((await call("get", "/api/approval", "lead")).body.acknowledgements, {});
});

test("sources: reviewer only, and the list never carries chunk text", async () => {
  reset();
  Source.find = () => chain([{ _id: "s1", name: "a.md", kind: "notes", sensitivity: "team", formality: "formal", createdAt: new Date("2026-03-01T10:00:00Z") }]);
  Chunk.aggregate = async () => [{ _id: "s1", n: 3 }];

  assert.equal((await call("get", "/api/sources")).status, 401);
  assert.equal((await call("get", "/api/sources", "incoming_developer")).status, 403);
  assert.equal((await call("post", "/api/sources", "incoming_lead")).status, 403);
  assert.equal((await call("post", "/api/sources")).status, 401);

  const res = await call("get", "/api/sources", "lead");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [{ id: "s1", name: "a.md", kind: "notes", sensitivity: "team", formality: "formal", chunkCount: 3, redactions: { credential: 0, email: 0, phone: 0 }, redactedTotal: 0, at: "2026-03-01T10:00:00" }]);
});

test("audit: reviewer only, newest first, extraction rows get a readable form", async () => {
  reset();
  AuditLog.find = () => chain([
    { at: new Date("2026-03-02T12:00:00Z"), actorId: { name: "Name lead" }, action: "Accepted", detail: "Team claim" },
    { at: new Date("2026-03-02T11:00:00Z"), actorId: { name: "Name lead" }, action: "extract", detail: null,
      after: { claimsCreated: 12, verified: 5, draftsReplaced: 9 } },
    { at: new Date("2026-03-02T10:00:00Z"), actorId: null, action: "Edited", detail: null },
  ]);

  assert.equal((await call("get", "/api/audit")).status, 401);
  for (const role of INCOMING) assert.equal((await call("get", "/api/audit", role)).status, 403);

  const res = await call("get", "/api/audit", "lead");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    { at: "2026-03-02T12:00:00", actor: "Name lead", action: "Accepted", detail: "Team claim" },
    { at: "2026-03-02T11:00:00", actor: "Name lead", action: "Extraction run", detail: "12 claims created, 5 verified, 9 drafts replaced" },
    { at: "2026-03-02T10:00:00", actor: "Unknown", action: "Edited", detail: null },
  ]);
});

// ---- Approval gate (Round 3) ----

test("approval is blocked by a draft and by an accepted mismatch, and names the claims", async () => {
  reset();
  live[0].evidence[0].quoteFound = false; // c_001 is accepted but its quote no longer matches
  const res = await call("post", "/api/approval", "lead");
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "2 claims block approval");
  assert.deepEqual(res.body.blockers, [
    { id: "c_001", kind: "mismatch", message: "Accepted but the quote does not match the source" },
    { id: "c_004", kind: "draft", message: "Still a draft" },
  ]);
  assert.equal(versions.length, 0);
  assert.equal(audits.length, 0);
  assert.equal(handoverUpdates, 0);
  assert.deepEqual((await call("get", "/api/claims", "incoming_lead")).body, []); // nothing was shared
});

test("a partial claim does not block approval, it is counted as a warning", async () => {
  reset();
  settle();
  live[0].evidence[0].supportsStatement = null; // quote found, support check not run
  const res = await call("post", "/api/approval", "lead");
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.versions[0].summary.warnings, { partial: 1, uncertain: 3, missing: 0, conflicting: 0 });
});

test("approving twice in a row makes one version and one audit row", async () => {
  reset();
  settle();
  assert.equal((await call("post", "/api/approval", "lead")).status, 201);
  const again = await call("post", "/api/approval", "lead");
  assert.equal(again.status, 409);
  assert.equal(again.body.error, "Version 1 is already approved and nothing changed");
  assert.equal(again.body.blockers, undefined);
  assert.equal(versions.length, 1);
  assert.equal(audits.filter((a) => a.action === "Handover approved").length, 1);
});

test("after a revoke the same content can be approved again as a new version", async () => {
  reset();
  settle();
  await call("post", "/api/approval", "lead");
  await call("delete", "/api/approval", "lead");
  const again = await call("post", "/api/approval", "lead");
  assert.equal(again.status, 201);
  assert.equal(again.body.approval.version, 2);
});