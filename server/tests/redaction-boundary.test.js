// Step S3.6: where sensitive text may and may not go.
//  1. Uploads of every file type: team and lead-only text is masked before it is stored,
//     restricted text is stored as written. The author field is masked too.
//  2. Nothing sensitive comes back in an upload response or an audit line.
//  3. Extraction can be told never to read restricted sources (EXTRACT_RESTRICTED=false).
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const Source = require("../src/models/Source");
const Chunk = require("../src/models/Chunk");
const AuditLog = require("../src/models/AuditLog");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");
const { extractionTiers, runExtraction, ExtractionFailed } = require("../src/services/extraction/pipeline");

const MD = [
  "# Deploy",
  "Call Ravi on 98765 43210 or mail ravi@example.com. The password is hunter2abc.",
  "",
  "# Plain",
  "Nothing sensitive here, just the weekly plan for the club.",
].join("\n");

const GITHUB = JSON.stringify({
  issues: [{
    number: 7, title: "Rotate keys", state: "open", created_at: "2026-03-01T10:00:00Z",
    body: "The password is hunter2abc, mail ravi@example.com",
    user: { login: "ravi@example.com" },
    comments: [{ user: { login: "meera" }, body: "token: ghp_abcdefghijklmnop1234 was leaked", created_at: "2026-03-02T10:00:00Z" }],
  }],
  commits: [{ sha: "abc123", message: "Remove api_key=sk-abcdefghijklmnop1234 from config, ask 98765 43210", author: "dev@example.com", date: "2026-03-03T10:00:00Z" }],
});

const CSV = [
  "Task,Owner,Status,Updated",
  '"Rotate the token ghp_abcdefghijklmnop1234 and the password is hunter2abc",ravi@example.com,open,2026-03-01',
  "Call the vendor on 98765 43210,Meera,open,2026-03-02",
].join("\n");

const FILES = [
  { name: "notes.md", body: MD, secrets: ["98765 43210", "ravi@example.com", "hunter2abc"] },
  { name: "history.json", body: GITHUB, secrets: ["hunter2abc", "ravi@example.com", "dev@example.com", "ghp_abcdefghijklmnop1234", "sk-abcdefghijklmnop1234", "98765 43210"] },
  { name: "tasks.csv", body: CSV, secrets: ["ghp_abcdefghijklmnop1234", "hunter2abc", "ravi@example.com", "98765 43210"] },
];

let created, inserted, audits;
const reset = () => { created = []; inserted = []; audits = []; };
Source.create = async (d) => { created.push(d); return { ...d, id: "s1", _id: "s1" }; };
Chunk.insertMany = async (rows) => { inserted = rows; };
AuditLog.create = async (d) => { audits.push(d); };

const lead = signToken({ _id: "u_lead", role: "lead", name: "Lead" });
const upload = (file, sensitivity) =>
  request(app).post("/api/sources").set("Authorization", "Bearer " + lead)
    .field("sensitivity", sensitivity).field("formality", "formal").attach("file", Buffer.from(file.body), file.name);

for (const file of FILES) {
  for (const tier of ["team", "lead_only"]) {
    test(file.name + " as " + tier + ": nothing sensitive is stored, in any field", async () => {
      reset();
      const res = await upload(file, tier);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.ok(inserted.length > 0);
      const stored = JSON.stringify(inserted);
      for (const secret of file.secrets) assert.ok(!stored.includes(secret), secret + " reached the database in " + file.name);
      assert.ok(stored.includes("[REDACTED]"));
      assert.ok(res.body.redactedTotal > 0);
    });

    test(file.name + " as " + tier + ": the response and the audit line carry counts, never text", async () => {
      reset();
      const res = await upload(file, tier);
      assert.equal(res.status, 201);
      const out = JSON.stringify(res.body) + JSON.stringify(audits);
      for (const secret of file.secrets) assert.ok(!out.includes(secret), secret + " leaked into a response or audit line");
    });
  }

  test(file.name + " as restricted: stored as written, and still never echoed back", async () => {
    reset();
    const res = await upload(file, "restricted");
    assert.equal(res.status, 201);
    const stored = JSON.stringify(inserted);
    assert.ok(stored.includes(file.secrets.find((s) => s.includes("hunter2abc") || s.includes("ghp_"))), "restricted text should be kept as written");
    assert.equal(created[0].redactions, null);
    const out = JSON.stringify(res.body) + JSON.stringify(audits);
    for (const secret of file.secrets) assert.ok(!out.includes(secret), secret + " leaked into a response or audit line");
    assert.ok(audits[0].detail.endsWith("stored as written"));
  });
}

test("the author field is masked for team sources and kept for restricted ones", async () => {
  reset();
  await upload(FILES[1], "team");
  assert.ok(inserted.every((c) => !c.author || !c.author.includes("@")), "an email stayed in the author field");
  assert.ok(inserted.some((c) => c.author === "[REDACTED]"));
  reset();
  await upload(FILES[1], "restricted");
  assert.ok(inserted.some((c) => c.author === "ravi@example.com"));
});

test("ordinary text and a non-string author are left alone", async () => {
  reset();
  await upload(FILES[0], "team");
  assert.ok(JSON.stringify(inserted).includes("weekly plan for the club"));
  assert.ok(inserted.every((c) => c.author === undefined || c.author === null || typeof c.author === "string"));
});

// ---- Extraction and the restricted tier -------------------------------------------
test("extractionTiers: restricted is read unless EXTRACT_RESTRICTED is exactly false", () => {
  assert.deepEqual(extractionTiers({}), ["team", "lead_only", "restricted"]);
  assert.deepEqual(extractionTiers({ EXTRACT_RESTRICTED: "true" }), ["team", "lead_only", "restricted"]);
  assert.deepEqual(extractionTiers({ EXTRACT_RESTRICTED: "" }), ["team", "lead_only", "restricted"]);
  assert.deepEqual(extractionTiers({ EXTRACT_RESTRICTED: "false" }), ["team", "lead_only"]);
  assert.deepEqual(extractionTiers({ EXTRACT_RESTRICTED: "FALSE" }), ["team", "lead_only", "restricted"]); // only the exact word turns it off
});

const chain = (result) => {
  const c = { sort: () => c, populate: () => c, lean: () => c, select: () => c, limit: () => c,
    then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  return c;
};

async function tiersAsked(envValue) {
  const before = process.env.EXTRACT_RESTRICTED;
  if (envValue === undefined) delete process.env.EXTRACT_RESTRICTED; else process.env.EXTRACT_RESTRICTED = envValue;
  const asked = [];
  const realFind = Chunk.find;
  Chunk.find = (filter) => { asked.push(filter.sensitivity); return chain([]); };
  let error = null;
  try {
    await runExtraction({ actorId: "u_lead", generate: async () => { throw new Error("should not be called"); }, log: () => {} });
  } catch (err) {
    error = err;
  } finally {
    Chunk.find = realFind;
    if (before === undefined) delete process.env.EXTRACT_RESTRICTED; else process.env.EXTRACT_RESTRICTED = before;
  }
  return { asked, error };
}

test("by default extraction reads all three tiers", async () => {
  const { asked, error } = await tiersAsked(undefined);
  assert.deepEqual(asked, ["team", "lead_only", "restricted"]);
  assert.ok(error instanceof ExtractionFailed);
  assert.equal(error.message, "No source chunks yet. Upload sources first.");
});

test("with EXTRACT_RESTRICTED=false the restricted tier is never even queried", async () => {
  const { asked, error } = await tiersAsked("false");
  assert.deepEqual(asked, ["team", "lead_only"]);
  assert.ok(error instanceof ExtractionFailed);
  assert.match(error.message, /Restricted sources are not sent/);
});