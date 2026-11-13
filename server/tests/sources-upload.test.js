// Uploads through the real app: team and lead-only text is redacted before it is stored,
// restricted text is stored as written, and only the reviewer may upload.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const Source = require("../src/models/Source");
const Chunk = require("../src/models/Chunk");
const AuditLog = require("../src/models/AuditLog");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

const NOTES = [
  "# Deploy",
  "Call Ravi on 98765 43210 or mail ravi@example.com. The password is hunter2abc.",
  "",
  "# Plain",
  "Nothing sensitive here, just the weekly plan for the club.",
].join("\n");

let created, inserted, audits;
function reset() {
  created = [];
  inserted = [];
  audits = [];
}
Source.create = async (d) => { created.push(d); return { ...d, id: "s1", _id: "s1" }; };
Chunk.insertMany = async (rows) => { inserted = rows; };
AuditLog.create = async (d) => { audits.push(d); };

const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: "Name " + role });
const upload = (role, sensitivity) => {
  let r = request(app).post("/api/sources");
  if (role) r = r.set("Authorization", "Bearer " + tokenFor(role));
  return r.field("sensitivity", sensitivity).field("formality", "formal").attach("file", Buffer.from(NOTES), "notes.md");
};
const allText = () => inserted.map((c) => c.text).join("\n");

test("team source: sensitive items are masked before storage and counted in the response and audit", async () => {
  reset();
  const res = await upload("lead", "team");
  assert.equal(res.status, 201);
  assert.ok(!/98765|ravi@example|hunter2abc/.test(allText()), "unmasked text reached the database");
  assert.ok(allText().includes("[REDACTED]"));
  assert.ok(allText().includes("weekly plan for the club")); // ordinary text is kept
  assert.deepEqual(res.body.redactions, { credential: 1, email: 1, phone: 1 });
  assert.equal(res.body.redactedTotal, 3);
  assert.equal(created[0].redactions.total, 3);
  assert.ok(audits[0].detail.includes("3 redacted (1 credential, 1 email, 1 phone number)"));
});

test("lead-only source is masked too", async () => {
  reset();
  const res = await upload("lead", "lead_only");
  assert.equal(res.status, 201);
  assert.ok(!/hunter2abc/.test(allText()));
  assert.equal(res.body.redactedTotal, 3);
});

test("restricted source is stored as written, and the response carries no text", async () => {
  reset();
  const res = await upload("lead", "restricted");
  assert.equal(res.status, 201);
  assert.ok(allText().includes("hunter2abc")); // that is what a restricted source is for
  assert.equal(created[0].redactions, null);
  assert.equal(res.body.redactedTotal, 0);
  assert.ok(!JSON.stringify(res.body).includes("hunter2abc"));
  assert.ok(audits[0].detail.endsWith("stored as written"));
});

test("only the reviewer can upload", async () => {
  reset();
  assert.equal((await upload(undefined, "team")).status, 401);
  for (const role of ["incoming_lead", "incoming_developer"]) {
    assert.equal((await upload(role, "team")).status, 403);
  }
  assert.equal(created.length, 0);
  assert.equal(inserted.length, 0);
});
