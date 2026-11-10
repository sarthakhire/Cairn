const test = require("node:test");
const assert = require("node:assert");
const { verifyQuote, hasVerifiedEvidence } = require("../src/services/verify");

const CHUNK = "Team: going with  Postgres, the reporting queries need joins. Done.";

test("exact quote passes, extra spaces in the chunk are ignored", () => {
  assert.ok(verifyQuote("going with Postgres, the reporting queries need joins", CHUNK));
});

test("paraphrase fails", () => {
  assert.equal(verifyQuote("we selected Postgres for reports", CHUNK), false);
});

test("matching ignores case", () => {
  assert.ok(verifyQuote("GOING WITH POSTGRES, the reporting queries", CHUNK));
});

test("smart quotes in the quote match straight quotes in the chunk", () => {
  assert.ok(verifyQuote("let\u2019s just use Mongo, schema keeps changing", "ok let's just use Mongo, schema keeps changing every week"));
});

test("smart quotes in the chunk match straight quotes in the quote", () => {
  assert.ok(verifyQuote("let's just use Mongo, schema keeps changing", "ok let\u2019s just use Mongo, schema keeps changing every week"));
});

test("line breaks and tabs in the chunk are ignored", () => {
  assert.ok(verifyQuote("going with Postgres, the reporting queries", "going with\n\tPostgres,\r\nthe reporting queries need joins"));
});

test("en dash and hyphen match", () => {
  assert.ok(verifyQuote("free tier ends - after that we pay", "free tier ends \u2013 after that we pay"));
});

test("empty and non-string input fail", () => {
  for (const bad of ["", "   ", null, undefined, 42, {}]) {
    assert.equal(verifyQuote(bad, CHUNK), false);
  }
  assert.equal(verifyQuote("going with Postgres, the reporting", ""), false);
  assert.equal(verifyQuote("going with Postgres, the reporting", null), false);
});

test("quote shorter than 15 characters fails, 15 characters passes", () => {
  assert.equal(verifyQuote("abcdefghijklmn", "xx abcdefghijklmn xx"), false); // 14
  assert.ok(verifyQuote("abcdefghijklmno", "xx abcdefghijklmno xx")); // 15
});

test("quote not present in the chunk fails", () => {
  assert.equal(verifyQuote("we are moving everything to Oracle next year", CHUNK), false);
});

test("leading and trailing ellipses (as in the mock data) are ignored", () => {
  assert.ok(verifyQuote("...going with Postgres, the reporting queries need joins...", CHUNK));
});

test("the single ellipsis character is ignored too", () => {
  assert.ok(verifyQuote("\u2026going with Postgres, the reporting queries\u2026", CHUNK));
});

test("ellipses cannot pad a short quote past the length check", () => {
  assert.equal(verifyQuote("...Postgres...", CHUNK), false);
});

test("a quote with an elided middle fails", () => {
  assert.equal(verifyQuote("going with Postgres ... need joins", CHUNK), false);
});

test("hasVerifiedEvidence needs a found quote AND a yes from the support check", () => {
  const ok = { quoteFound: true, supportsStatement: true };
  assert.equal(hasVerifiedEvidence([ok]), true);
  assert.equal(hasVerifiedEvidence([{ quoteFound: false, supportsStatement: true }]), false);
  assert.equal(hasVerifiedEvidence([{ quoteFound: true, supportsStatement: false }]), false);
  assert.equal(hasVerifiedEvidence([{ quoteFound: true, supportsStatement: null }]), false);
  assert.equal(hasVerifiedEvidence([]), false);
  assert.equal(hasVerifiedEvidence(undefined), false);
  assert.equal(hasVerifiedEvidence([{ quoteFound: false, supportsStatement: false }, ok]), true);
});