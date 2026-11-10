// Leak tests: every role calls the real routes (real app, real JWT, real
// permission code). Only the database is replaced by fixtures. The stub
// ignores the query filter on purpose, so these tests prove the final
// permission pass protects the response even if the query were wrong.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Claim = require("../src/models/Claim");
const User = require("../src/models/User");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

const SECRETS = {
  restricted: "FAKE_KEY_abc123",
  leadOnly: "LEADONLY_BUDGET_TALK",
  draft: "DRAFT_ONLY_TEXT",
};

const chunk = (n, name) => ({ n, timestamp: new Date("2026-02-03T00:00:00Z"), sourceId: { name } });
const stored = (claimId, visibility, state, statement, quote, extra = {}) => ({
  claimId, type: "decision", statement, status: "uncertain", visibility,
  evidence: [{ quote, chunkId: chunk(1, "src.md") }],
  review: { state, reviewerId: state === "draft" ? null : { name: "Lead" }, at: null },
  nextAction: null, conflictsWith: [], inference: false, ...extra,
});

const FIXTURES = [
  stored("c_001", "team", "accepted", "Team claim", "a quote long enough to count", { conflictsWith: ["c_002", "c_003"] }),
  stored("c_002", "lead_only", "accepted", SECRETS.leadOnly, SECRETS.leadOnly + " in the notes"),
  stored("c_003", "restricted", "accepted", "Key is " + SECRETS.restricted, "the key is " + SECRETS.restricted, { nextAction: "rotate " + SECRETS.restricted }),
  stored("c_004", "team", "draft", SECRETS.draft, SECRETS.draft + " quote here"),
  stored("c_005", "team", "rejected", "Rejected claim " + SECRETS.draft, SECRETS.draft + " again"),
];

const chain = (result) => {
  const c = { sort: () => c, populate: () => c, lean: () => c, select: () => c,
    then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  return c;
};
Claim.find = () => chain(structuredClone(FIXTURES));

const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: role });
const get = (path, role) => request(app).get(path).set("Authorization", "Bearer " + tokenFor(role));
const ids = (res) => res.body.map((c) => c.id);

test("no token, bad token, wrong secret, alg none, unknown role: all 401", async () => {
  assert.equal((await request(app).get("/api/claims")).status, 401);
  assert.equal((await request(app).get("/api/claims").set("Authorization", "Bearer nonsense")).status, 401);
  const forged = jwt.sign({ role: "lead" }, "some-other-secret-123456", { subject: "x" });
  assert.equal((await request(app).get("/api/claims").set("Authorization", "Bearer " + forged)).status, 401);
  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url") + "." +
    Buffer.from('{"role":"lead","sub":"x"}').toString("base64url") + ".";
  assert.equal((await request(app).get("/api/claims").set("Authorization", "Bearer " + none)).status, 401);
  const badRole = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { subject: "x" });
  assert.equal((await request(app).get("/api/claims").set("Authorization", "Bearer " + badRole)).status, 401);
});

test("reviewer (lead) gets everything, real text included", async () => {
  const res = await get("/api/claims", "lead");
  assert.equal(res.status, 200);
  assert.deepEqual(ids(res), ["c_001", "c_002", "c_003", "c_004", "c_005"]);
  assert.ok(JSON.stringify(res.body).includes(SECRETS.restricted));
});

test("incoming developer: team only plus a masked restricted placeholder, no secrets anywhere", async () => {
  const res = await get("/api/claims", "incoming_developer");
  assert.equal(res.status, 200);
  assert.deepEqual(ids(res), ["c_001", "c_003"]);
  const text = JSON.stringify(res.body);
  for (const s of Object.values(SECRETS)) assert.ok(!text.includes(s), "leaked " + s);
  assert.deepEqual(res.body[0].conflictsWith, ["c_003"]); // c_002 (lead_only) id is stripped
  assert.equal(res.body[1].statement, "Restricted: request access from reviewer");
});

test("incoming lead: lead_only is real, restricted still masked, drafts hidden", async () => {
  const res = await get("/api/claims", "incoming_lead");
  assert.deepEqual(ids(res), ["c_001", "c_002", "c_003"]);
  const text = JSON.stringify(res.body);
  assert.ok(text.includes(SECRETS.leadOnly));
  assert.ok(!text.includes(SECRETS.restricted));
  assert.ok(!text.includes(SECRETS.draft));
});

test("single claim route: hidden looks the same as missing", async () => {
  Claim.find = (filter) => chain(structuredClone(FIXTURES.filter((c) =>
    filter.claimId ? (filter.claimId.$in ? filter.claimId.$in.includes(c.claimId) : c.claimId === filter.claimId) : true)));
  const hidden = await get("/api/claims/c_002", "incoming_developer");
  const missing = await get("/api/claims/c_999", "incoming_developer");
  assert.equal(hidden.status, 404);
  assert.deepEqual(hidden.body, missing.body);
  assert.equal((await get("/api/claims/c_004", "incoming_lead")).status, 404); // draft
  assert.equal((await get("/api/claims/not-an-id", "lead")).status, 404);

  const masked = await get("/api/claims/c_003", "incoming_developer");
  assert.equal(masked.status, 200);
  assert.ok(!JSON.stringify(masked.body).includes(SECRETS.restricted));

  const team = await get("/api/claims/c_001", "incoming_developer");
  assert.deepEqual(team.body.conflictsWith, ["c_003"]);
  Claim.find = () => chain(structuredClone(FIXTURES));
});

test("login: good password returns a token and no hash, bad ones are one identical 401", async () => {
  const hash = bcrypt.hashSync("correct horse", 4);
  const user = { _id: "u1", name: "Lead", email: "lead@cairn.demo", role: "lead", passwordHash: hash };
  User.findOne = ({ email }) => chain(email === user.email ? user : null);

  const ok = await request(app).post("/api/auth/login").send({ email: " LEAD@cairn.demo ", password: "correct horse" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, "lead");
  assert.ok(!JSON.stringify(ok.body).includes(hash));
  const payload = jwt.verify(ok.body.token, process.env.JWT_SECRET);
  assert.equal(payload.role, "lead");

  const wrong = await request(app).post("/api/auth/login").send({ email: "lead@cairn.demo", password: "nope" });
  const unknown = await request(app).post("/api/auth/login").send({ email: "who@cairn.demo", password: "nope" });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
});

test("login rejects malformed bodies, including NoSQL operator objects", async () => {
  let queried = false;
  User.findOne = () => { queried = true; return chain(null); };
  for (const body of [{}, { email: "a@b.co" }, { email: { $ne: "" }, password: { $ne: "" } }, { email: "not-an-email", password: "x" }]) {
    const res = await request(app).post("/api/auth/login").send(body);
    assert.equal(res.status, 400);
  }
  assert.equal(queried, false);
});