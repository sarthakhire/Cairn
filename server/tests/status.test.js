const test = require("node:test");
const assert = require("node:assert");
const { assignStatus } = require("../src/services/extraction/status");

const base = { type: "decision", hasQuote: true, chunkFound: true, quoteFound: true, formality: "formal", supportsStatement: true };

test("formal source, quote found, support check yes: verified", () => {
  assert.equal(assignStatus(base), "verified");
});

test("quote not found or chunk label invalid: uncertain", () => {
  assert.equal(assignStatus({ ...base, quoteFound: false }), "uncertain");
  assert.equal(assignStatus({ ...base, chunkFound: false, quoteFound: false }), "uncertain");
});

test("support check no, or not run: uncertain", () => {
  assert.equal(assignStatus({ ...base, supportsStatement: false }), "uncertain");
  assert.equal(assignStatus({ ...base, supportsStatement: null }), "uncertain");
});

test("informal source never reaches verified", () => {
  assert.equal(assignStatus({ ...base, formality: "informal" }), "uncertain");
  assert.equal(assignStatus({ ...base, formality: undefined }), "uncertain");
});

test("no quote: gap types become missing, everything else is dropped", () => {
  for (const type of ["open_question", "ownership"]) {
    assert.equal(assignStatus({ ...base, type, hasQuote: false }), "missing");
  }
  for (const type of ["decision", "risk_dependency", "next_action"]) {
    assert.equal(assignStatus({ ...base, type, hasQuote: false }), null);
  }
});