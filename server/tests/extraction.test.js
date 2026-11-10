// Runs the whole pipeline with a scripted fake model and an in-memory database.
// Claim.create is replaced by a version that still runs the real model
// validation (including the "verified needs evidence" rule).
const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const Chunk = require("../src/models/Chunk");
const Claim = require("../src/models/Claim");
const Counter = require("../src/models/Counter");
const AuditLog = require("../src/models/AuditLog");
const { runExtraction, ExtractionFailed } = require("../src/services/extraction/pipeline");
const { LlmOutputError } = require("../src/services/llm");
const P = require("../src/services/extraction/prompts");

const oid = () => new mongoose.Types.ObjectId();
const src = (name, formality) => ({ name, formality, createdAt: new Date("2026-02-01T00:00:00Z") });
const TEXT = {
  postgres: "Team call: going with Postgres, the reporting queries need joins. Done.",
  mongo: "let's just use Mongo, schema keeps changing every week",
  budget: "LEADONLY_BUDGET_TALK we may cut the contractor budget in March",
  key: "deploy key is FAKE_KEY_abc123 keep this private",
};
const CHUNKS = [
  { _id: oid(), sensitivity: "team", n: 1, text: TEXT.postgres, sourceId: src("meeting-notes-01.md", "formal") },
  { _id: oid(), sensitivity: "team", n: 1, text: TEXT.mongo, sourceId: src("chat-export.md", "informal") },
  { _id: oid(), sensitivity: "lead_only", n: 1, text: TEXT.budget, sourceId: src("lead-notes.md", "formal") },
  { _id: oid(), sensitivity: "restricted", n: 1, text: TEXT.key, sourceId: src("ops-secrets.md", "formal") },
];
const TIER_OF_TEXT = new Map(CHUNKS.map((c) => [c.text, c.sensitivity]));

const chain = (result) => {
  const c = { select: () => c, populate: () => c, sort: () => c, lean: () => c, then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  return c;
};

// Reads the chunks back out of a prompt, the way the model would see them.
function chunksIn(user) {
  const out = new Map();
  for (const m of user.matchAll(/<<<CHUNK (C\d+) [^\n]*>>>\n([\s\S]*?)\n<<<END \1>>>/g)) out.set(m[1], m[2]);
  return out;
}
const labelOf = (user, needle) => [...chunksIn(user)].find(([, body]) => body.includes(needle))?.[0] ?? null;

// A scripted model. `extractor(type, user)` returns raw claims for an extraction call.
function makeModel({ extractor, supports = () => true, contradicts = () => false } = {}) {
  const calls = [];
  const generate = async ({ system, user, schema }) => {
    calls.push({ system, user });
    let raw;
    if (system === P.EXTRACT_SYSTEM) raw = { claims: extractor(user.match(/Requested claim type: (\w+)/)[1], user) };
    else if (system === P.SUPPORT_SYSTEM) raw = { supports: supports(user) };
    else raw = { contradicts: contradicts(user) };
    return schema.parse(raw);
  };
  return { generate, calls };
}

function setupDb({ existing = [], chunks = CHUNKS } = {}) {
  const db = { saved: [], deletes: [], audit: [], seq: 0 };
  Chunk.find = () => chain(chunks.map((c) => ({ ...c, sourceId: { ...c.sourceId } }))); // ignores the tier filter on purpose
  Claim.find = () => chain(existing);
  Claim.deleteMany = async (f) => (db.deletes.push(f), { deletedCount: 3 });
  Claim.create = async (doc) => { await new Claim(doc).validate(); db.saved.push(doc); return doc; };
  Counter.findOneAndUpdate = async () => ({ seq: ++db.seq });
  AuditLog.create = async (d) => db.audit.push(d);
  return db;
}

const standardExtractor = (type, user) => {
  const claims = [];
  const p = labelOf(user, "going with Postgres");
  const m = labelOf(user, "use Mongo");
  const b = labelOf(user, "LEADONLY_BUDGET_TALK");
  const k = labelOf(user, "FAKE_KEY_abc123");
  if (type === "decision") {
    if (p) claims.push({ statement: "The team chose PostgreSQL for reporting joins.", quote: "going with Postgres, the reporting queries need joins", chunk: p, subject: "Database" });
    if (m) claims.push({ statement: "The team chose MongoDB because the schema keeps changing.", quote: "let's just use Mongo, schema keeps changing every week", chunk: m, subject: "database" });
    if (p) claims.push({ statement: "The team picked Oracle because it is cheap.", quote: "we picked Oracle because it is cheap and fast", chunk: p, subject: "vendor" }); // fabricated quote
    if (b) claims.push({ statement: "The contractor budget may be cut in March.", quote: "we may cut the contractor budget in March", chunk: b });
  }
  if (type === "risk_dependency" && k) claims.push({ statement: "The deploy key must stay private.", quote: "deploy key is FAKE_KEY_abc123 keep this private", chunk: k });
  if (type === "open_question") claims.push({ statement: "Who owns the deployment credentials?", quote: null, chunk: null });
  if (type === "next_action") claims.push({ statement: "Rotate the keys soon.", quote: null, chunk: null }); // not allowed without a quote
  return claims;
};

test("each prompt contains chunks of exactly one tier, and claims inherit that tier", async () => {
  const db = setupDb();
  const model = makeModel({ extractor: standardExtractor });
  await runExtraction({ actorId: "u1", generate: model.generate, log: () => {} });

  for (const { system, user } of model.calls.filter((c) => c.system === P.EXTRACT_SYSTEM)) {
    const tiers = new Set([...chunksIn(user).values()].map((body) => TIER_OF_TEXT.get(body)));
    assert.equal(tiers.size, 1, "a prompt mixed tiers: " + [...tiers]);
  }
  const byText = (needle) => db.saved.find((c) => c.statement.includes(needle));
  assert.equal(byText("contractor budget").visibility, "lead_only");
  assert.equal(byText("deploy key").visibility, "restricted");
  assert.equal(byText("PostgreSQL").visibility, "team");
  for (const c of db.saved.filter((c) => /FAKE_KEY/.test(JSON.stringify(c)))) assert.equal(c.visibility, "restricted");
});

test("a fabricated quote is kept but downgraded to uncertain", async () => {
  const db = setupDb();
  const out = await runExtraction({ actorId: "u1", generate: makeModel({ extractor: standardExtractor }).generate, log: () => {} });
  const fake = db.saved.find((c) => c.statement.includes("Oracle"));
  assert.equal(fake.status, "uncertain");
  assert.equal(fake.evidence[0].quoteFound, false);
  assert.equal(out.quotesNotFound, 1);
});

test("verified needs a formal source and a yes from the support check", async () => {
  let db = setupDb();
  await runExtraction({ actorId: "u1", generate: makeModel({ extractor: standardExtractor, contradicts: () => false }).generate, log: () => {} });
  assert.equal(db.saved.find((c) => c.statement.includes("PostgreSQL")).status, "verified");
  assert.equal(db.saved.find((c) => c.statement.includes("MongoDB")).status, "uncertain"); // informal source

  db = setupDb();
  await runExtraction({ actorId: "u1", generate: makeModel({ extractor: standardExtractor, supports: () => false }).generate, log: () => {} });
  assert.equal(db.saved.find((c) => c.statement.includes("PostgreSQL")).status, "uncertain");
  assert.equal(db.saved.find((c) => c.statement.includes("PostgreSQL")).evidence[0].supportsStatement, false);
});

test("two contradicting claims with the same subject become conflicting and point at each other", async () => {
  const db = setupDb();
  await runExtraction({ actorId: "u1", generate: makeModel({ extractor: standardExtractor, contradicts: () => true }).generate, log: () => {} });
  const pg = db.saved.find((c) => c.statement.includes("PostgreSQL"));
  const mg = db.saved.find((c) => c.statement.includes("MongoDB"));
  assert.equal(pg.status, "conflicting");
  assert.equal(mg.status, "conflicting");
  assert.deepEqual(pg.conflictsWith, [mg.claimId]);
  assert.deepEqual(mg.conflictsWith, [pg.claimId]);
  assert.equal(pg.baseStatus, "verified");
  assert.deepEqual(db.saved.find((c) => c.statement.includes("budget")).conflictsWith, []);

  // A conflict link must never cross a tier.
  const tierById = new Map(db.saved.map((c) => [c.claimId, c.visibility]));
  for (const c of db.saved) for (const id of c.conflictsWith) assert.equal(tierById.get(id), c.visibility);
});

test("no-quote claims: open question becomes missing, a quote-less next action is dropped", async () => {
  const db = setupDb();
  const out = await runExtraction({ actorId: "u1", generate: makeModel({ extractor: standardExtractor }).generate, log: () => {} });
  const gap = db.saved.find((c) => c.statement.includes("deployment credentials"));
  assert.equal(gap.status, "missing");
  assert.deepEqual(gap.evidence, []);
  assert.equal(gap.inference, true);
  assert.ok(!db.saved.some((c) => c.statement.includes("Rotate the keys")));
  assert.ok(out.dropped >= 1);
});

test("an unknown chunk label gives an uncertain claim with no evidence", async () => {
  const db = setupDb();
  const extractor = (type) => type === "decision"
    ? [{ statement: "The team uses Kubernetes in production.", quote: "we run everything on kubernetes clusters", chunk: "C99" }]
    : [];
  await runExtraction({ actorId: "u1", generate: makeModel({ extractor }).generate, log: () => {} });
  const c = db.saved.find((x) => x.statement.includes("Kubernetes"));
  assert.equal(c.status, "uncertain");
  assert.deepEqual(c.evidence, []);
  assert.equal(c.inference, true);
});

test("summary reports counts and evidence coverage; the run is audited", async () => {
  const db = setupDb();
  const out = await runExtraction({ actorId: "u1", generate: makeModel({ extractor: standardExtractor }).generate, log: () => {} });
  assert.equal(out.claimsCreated, db.saved.length);
  assert.equal(out.verified + out.uncertain + out.conflicting + out.missing, out.claimsCreated);
  assert.equal(out.evidenceCoverage, Math.round((out.verified / out.claimsCreated) * 100) / 100);
  assert.equal(out.draftsReplaced, 3);
  assert.equal(db.audit[0].action, "extract");
  assert.deepEqual(db.deletes, [{ "review.state": "draft" }]); // reviewed claims are never deleted
});

test("claims that already exist as reviewed claims are not created again", async () => {
  const existing = [{ visibility: "team", type: "decision", statement: "the team chose postgresql for reporting joins" }];
  const db = setupDb({ existing });
  const out = await runExtraction({ actorId: "u1", generate: makeModel({ extractor: standardExtractor }).generate, log: () => {} });
  assert.equal(out.duplicatesSkipped, 1);
  assert.ok(!db.saved.some((c) => c.statement.includes("PostgreSQL")));
});

test("if every batch fails, nothing is deleted and the run reports failure", async () => {
  const db = setupDb();
  const generate = async () => { throw new LlmOutputError("bad output"); };
  await assert.rejects(() => runExtraction({ actorId: "u1", generate, log: () => {} }), ExtractionFailed);
  assert.deepEqual(db.deletes, []);
  assert.deepEqual(db.saved, []);
});

test("with no chunks the run fails with 422 before calling the model", async () => {
  setupDb({ chunks: [] });
  let called = false;
  await assert.rejects(
    () => runExtraction({ actorId: "u1", generate: async () => { called = true; }, log: () => {} }),
    (err) => err instanceof ExtractionFailed && err.status === 422
  );
  assert.equal(called, false);
});