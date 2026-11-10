const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

// Validation tests need no database. Stop Mongoose from trying to build indexes.
mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);

const Claim = require("../src/models/Claim");
const User = require("../src/models/User");
const Source = require("../src/models/Source");
const { formatClaimId } = require("../src/services/ids");

const baseClaim = () => ({
  claimId: "c_001",
  type: "decision",
  statement: "The team chose PostgreSQL because the reporting queries need joins.",
  visibility: "team",
});

const goodEvidence = () => ({
  chunkId: new mongoose.Types.ObjectId(),
  quote: "going with Postgres, the reporting queries need joins",
  quoteFound: true,
  supportsStatement: true,
});

const failsOn = (doc, path) =>
  assert.rejects(
    () => doc.validate(),
    (err) => {
      assert.ok(err.errors[path], "expected a validation error on " + path);
      return true;
    }
  );

test("verified claim with no evidence is rejected", () =>
  failsOn(new Claim({ ...baseClaim(), status: "verified", evidence: [] }), "status"));

test("verified claim whose quote was not found is rejected", () =>
  failsOn(
    new Claim({ ...baseClaim(), status: "verified", evidence: [{ ...goodEvidence(), quoteFound: false }] }),
    "status"
  ));

test("verified claim whose quote does not support the statement is rejected", () =>
  failsOn(
    new Claim({ ...baseClaim(), status: "verified", evidence: [{ ...goodEvidence(), supportsStatement: false }] }),
    "status"
  ));

test("verified claim with a found, supporting quote is valid", async () => {
  await new Claim({ ...baseClaim(), status: "verified", evidence: [goodEvidence()] }).validate();
});

test("missing and uncertain claims may have no evidence", async () => {
  await new Claim({ ...baseClaim(), status: "missing" }).validate();
  await new Claim({ ...baseClaim(), status: "uncertain" }).validate();
});

test("new claims default to draft, uncertain and no inference", () => {
  const c = new Claim(baseClaim());
  assert.equal(c.review.state, "draft");
  assert.equal(c.status, "uncertain");
  assert.equal(c.inference, false);
  assert.equal(c.nextAction, null);
});

test("old vocabulary is rejected: visibility 'lead', type 'risk'", async () => {
  await failsOn(new Claim({ ...baseClaim(), visibility: "lead" }), "visibility");
  await failsOn(new Claim({ ...baseClaim(), type: "risk" }), "type");
});

test("user roles use the frontend names", async () => {
  const user = { name: "A", email: "a@example.com", passwordHash: "x" };
  await new User({ ...user, role: "incoming_developer" }).validate();
  await new User({ ...user, role: "lead" }).validate();
  await failsOn(new User({ ...user, role: "reviewer" }), "role");
  await failsOn(new User({ ...user, role: "developer" }), "role");
});

test("source needs a sensitivity label and formality", async () => {
  await failsOn(new Source({ name: "a.md", kind: "notes", formality: "formal" }), "sensitivity");
  await failsOn(new Source({ name: "a.md", kind: "notes", sensitivity: "team" }), "formality");
});

test("claim ids are padded to three digits", () => {
  assert.equal(formatClaimId(1), "c_001");
  assert.equal(formatClaimId(42), "c_042");
  assert.equal(formatClaimId(1000), "c_1000");
});