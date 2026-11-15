// S2.4 through the real routes: real app, real JWT, real permission code, fixtures
// instead of the database. Expected results are computed from the unfiltered response
// of the same role, so these tests do not depend on the exact shape of other fields.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const Claim = require("../src/models/Claim");
const Handover = require("../src/models/Handover");
const Version = require("../src/models/Version");
const { serializeClaim } = require("../src/services/serializer");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

const SECRETS = { restricted: "FAKE_KEY_abc123", leadOnly: "LEADONLY_BUDGET_TALK", draft: "DRAFT_ONLY_TEXT" };

const chunk = (n, name) => ({ n, timestamp: new Date("2026-02-03T00:00:00Z"), sourceId: { name } });
const match = (result) => ({ result, score: result === "verified" ? 1 : 0.5, method: result === "verified" ? "exact" : "fuzzy", reason: null, closest: null });
const ev = (quote, result) => ({ quote, chunkId: chunk(1, "src.md"), ...(result ? { match: match(result) } : {}) });
const stored = (claimId, visibility, state, statement, extra = {}) => ({
  claimId, type: "decision", statement, status: "uncertain", visibility,
  evidence: [ev("a quote long enough to count")],
  review: { state, reviewerId: state === "draft" ? null : { name: "Lead" }, at: null },
  nextAction: null, conflictsWith: [], inference: false, ...extra,
});

const FIXTURES = [
  stored("c_001", "team", "accepted", "Deploys freeze on Friday", { status: "verified", evidence: [ev("deploys freeze on friday afternoon", "verified")] }),
  stored("c_002", "lead_only", "accepted", SECRETS.leadOnly + " is the plan", { type: "risk_dependency" }),
  stored("c_003", "restricted", "accepted", "Key is " + SECRETS.restricted, { type: "ownership", nextAction: "rotate " + SECRETS.restricted }),
  stored("c_004", "team", "draft", SECRETS.draft + " statement", { type: "next_action", evidence: [ev("a draft quote here", "mismatch")] }),
  stored("c_005", "team", "rejected", "Rejected freeze note", { evidence: [ev("a rejected quote here", "partial")] }),
  stored("c_006", "team", "edited", "Who owns the pager?", { type: "open_question", status: "missing", evidence: [] }),
];

const chain = (result) => {
  const c = { sort: () => c, populate: () => c, lean: () => c, select: () => c,
    then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  return c;
};
Claim.find = () => chain(structuredClone(FIXTURES));
Handover.findById = () => chain({ _id: "handover", approvedVersion: 1, acknowledgements: {} });
Version.findOne = () => chain({
  number: 1, byName: "Lead", at: new Date("2026-03-02T18:40:00Z"),
  claims: structuredClone(FIXTURES.map(serializeClaim)),
});

const ROLES = ["lead", "incoming_lead", "incoming_developer"];
const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: role });
const get = (path, role) => request(app).get(path).set("Authorization", "Bearer " + tokenFor(role));
const ids = (res) => res.body.map((c) => c.id);

async function expectFilter(role, query, predicate) {
  const all = await get("/api/claims", role);
  const res = await get("/api/claims?" + query, role);
  assert.equal(res.status, 200, query);
  assert.deepEqual(ids(res), all.body.filter(predicate).map((c) => c.id), role + " ?" + query);
  return res;
}

test("no parameters and unknown parameters return the full list", async () => {
  const all = await get("/api/claims", "lead");
  assert.equal(all.status, 200);
  assert.deepEqual(ids(all), ["c_001", "c_002", "c_003", "c_004", "c_005", "c_006"]);
  const extra = await get("/api/claims?_=123&foo=bar", "lead");
  assert.deepEqual(ids(extra), ids(all));
});

test("lead: each filter returns exactly the matching claims", async () => {
  const draft = await expectFilter("lead", "review=draft", (c) => c.review.state === "draft");
  assert.deepEqual(ids(draft), ["c_004"]);
  await expectFilter("lead", "review=draft,rejected", (c) => ["draft", "rejected"].includes(c.review.state));
  await expectFilter("lead", "review=draft&review=rejected", (c) => ["draft", "rejected"].includes(c.review.state));
  await expectFilter("lead", "type=decision", (c) => c.type === "decision");
  await expectFilter("lead", "status=missing", (c) => c.status === "missing");
  await expectFilter("lead", "visibility=lead_only", (c) => c.visibility === "lead_only");
  await expectFilter("lead", "review=accepted&type=decision", (c) => c.review.state === "accepted" && c.type === "decision");
});

test("lead: verification filter", async (t) => {
  const all = await get("/api/claims", "lead");
  if (!all.body.some((c) => "verification" in c)) return t.skip("claims do not expose verification yet (step S1.4)");
  const mismatch = await expectFilter("lead", "verification=mismatch", (c) => c.verification === "mismatch");
  assert.ok(mismatch.body.length > 0, "fixtures should contain a mismatch claim");
  await expectFilter("lead", "verification=none", (c) => c.verification === "none");
  await expectFilter("lead", "verification=partial,mismatch", (c) => ["partial", "mismatch"].includes(c.verification));
});

test("lead: q and sort", async () => {
  const freeze = await expectFilter("lead", "q=FREEZE", (c) => /freeze/i.test(c.statement));
  assert.deepEqual(ids(freeze), ["c_001", "c_005"]);
  const byId = await expectFilter("lead", "q=c_00", () => true);
  assert.equal(byId.body.length, 6);
  const desc = await get("/api/claims?sort=-id", "lead");
  assert.deepEqual(ids(desc), ["c_006", "c_005", "c_004", "c_003", "c_002", "c_001"]);
  const asc = await get("/api/claims?sort=id", "lead");
  assert.deepEqual(ids(asc), ["c_001", "c_002", "c_003", "c_004", "c_005", "c_006"]);
});

test("bad values return 400 with a JSON error, for every role", async () => {
  const bad = ["review=bogus", "type=nope", "status=x", "visibility=public", "verification=great", "sort=name",
    "q=" + "a".repeat(101), "q=a&q=b", "review=draft,bogus"];
  for (const role of ROLES) {
    for (const query of bad) {
      const res = await get("/api/claims?" + query, role);
      assert.equal(res.status, 400, role + " ?" + query);
      assert.equal(typeof res.body.error, "string");
    }
  }
});

test("incoming developer: filters cannot reach drafts, lead-only text or restricted text", async () => {
  assert.deepEqual((await get("/api/claims?review=draft", "incoming_developer")).body, []);
  assert.deepEqual((await get("/api/claims?review=rejected", "incoming_developer")).body, []);
  assert.deepEqual((await get("/api/claims?visibility=lead_only", "incoming_developer")).body, []);
  assert.deepEqual((await get("/api/claims?q=" + SECRETS.leadOnly, "incoming_developer")).body, []);
  assert.deepEqual((await get("/api/claims?q=" + SECRETS.restricted, "incoming_developer")).body, []);
  assert.deepEqual((await get("/api/claims?q=" + SECRETS.draft, "incoming_developer")).body, []);
  assert.deepEqual((await get("/api/claims?q=c_002", "incoming_developer")).body, []); // hidden id is not searchable
  assert.deepEqual((await get("/api/claims?q=c_004", "incoming_developer")).body, []);

  // The masked placeholder text is searchable, the real text behind it is not.
  const masked = await get("/api/claims?q=Restricted", "incoming_developer");
  assert.deepEqual(ids(masked), ["c_003"]);
  assert.ok(!JSON.stringify(masked.body).includes(SECRETS.restricted));
});

test("incoming lead: lead_only is searchable, restricted text is not", async () => {
  assert.deepEqual(ids(await get("/api/claims?q=" + SECRETS.leadOnly, "incoming_lead")), ["c_002"]);
  assert.deepEqual((await get("/api/claims?q=" + SECRETS.restricted, "incoming_lead")).body, []);
  assert.deepEqual((await get("/api/claims?review=draft", "incoming_lead")).body, []);
});

test("for every role and query, results are a subset of the unfiltered list and leak nothing", async () => {
  const queries = ["", "review=draft", "review=accepted", "review=edited", "type=ownership", "visibility=restricted",
    "status=verified", "q=key", "q=freeze", "sort=-id", "sort=id", "review=accepted,edited&sort=-id",
    "q=" + SECRETS.restricted, "q=" + SECRETS.draft, "verification=mismatch", "verification=none"];
  for (const role of ROLES) {
    const all = await get("/api/claims", role);
    const allIds = new Set(ids(all));
    for (const query of queries) {
      const res = await get("/api/claims?" + query, role);
      assert.equal(res.status, 200, role + " ?" + query);
      for (const id of ids(res)) assert.ok(allIds.has(id), role + " ?" + query + " returned " + id + " that the role cannot see");
      const text = JSON.stringify(res.body);
      if (role !== "lead") assert.ok(!text.includes(SECRETS.restricted), role + " leaked restricted via ?" + query);
      if (role === "incoming_developer") assert.ok(!text.includes(SECRETS.leadOnly), role + " leaked lead-only via ?" + query);
      if (role !== "lead") assert.ok(!text.includes(SECRETS.draft), role + " leaked a draft via ?" + query);
    }
  }
});
test("as=<role> gives the lead the same list that role really gets", async () => {
  for (const role of ["incoming_lead", "incoming_developer"]) {
    const real = await get("/api/claims", role);
    const preview = await get("/api/claims?as=" + role, "lead");
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.body, real.body, role);
  }
});