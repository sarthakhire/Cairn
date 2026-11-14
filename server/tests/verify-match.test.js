const test = require("node:test");
const assert = require("node:assert");
const {
  matchQuote,
  PARTIAL_MIN,
  WINDOW_LOW,
  WINDOW_HIGH,
  MAX_CLOSEST_CHARS,
} = require("../src/services/verify");

const CHUNK =
  "Decision log. Team agreed on Postgres, the reporting queries need joins. " +
  "The free tier ends on 2026-03-05, after that we pay for hosting. " +
  "We will not migrate the auth service this quarter. " +
  "Do not share the staging password with anyone outside the team. " +
  "The vendor requires at least 30 days of notice before we leave. " +
  "Owner for billing is Priya.";

// Expected outcome for every pair. `reason` is checked as a substring.
// Scores are printed by the calibration step (S1.10); only results are fixed here.
const TABLE = [
  // exact matches
  { name: "exact, support yes", quote: "Team agreed on Postgres, the reporting queries need joins", chunk: CHUNK, supports: true, result: "verified", method: "exact", reason: null },
  { name: "exact, support no", quote: "Team agreed on Postgres, the reporting queries need joins", chunk: CHUNK, supports: false, result: "mismatch", method: "exact", reason: "does not support" },
  { name: "exact, support check not run", quote: "Team agreed on Postgres, the reporting queries need joins", chunk: CHUNK, supports: undefined, result: "partial", method: "exact", reason: "support check not run" },
  { name: "curly quote drift", quote: "let\u2019s just use Mongo, schema keeps changing", chunk: "ok let's just use Mongo, schema keeps changing every week", supports: true, result: "verified", method: "exact", reason: null },
  { name: "whitespace and case drift", quote: "GOING WITH POSTGRES, the reporting queries", chunk: "going with\n\t Postgres,\r\n the   reporting queries need joins", supports: true, result: "verified", method: "exact", reason: null },
  { name: "edge ellipses ignored", quote: "...Team agreed on Postgres, the reporting queries need joins...", chunk: CHUNK, supports: true, result: "verified", method: "exact", reason: null },

  // benign differences: partial, never verified
  { name: "one typo", quote: "Team agreed on Postgress, the reporting queries need joins", chunk: CHUNK, supports: true, result: "partial", method: "fuzzy", reason: "wording differs" },
  { name: "one extra word", quote: "Team agreed on Postgres, the reporting queries really need joins", chunk: CHUNK, supports: true, result: "partial", method: "fuzzy", reason: "wording differs" },

  // things that must NOT pass
  { name: "paraphrase", quote: "we picked Postgres because the reports need joins", chunk: CHUNK, supports: true, result: "mismatch" },
  { name: "fabricated quote", quote: "Management approved a 40 percent budget increase for Q4", chunk: CHUNK, supports: true, result: "mismatch", method: "none", reason: "no close passage" },
  { name: "date changed (day)", quote: "The free tier ends on 2026-03-15, after that we pay for hosting", chunk: CHUNK, supports: true, result: "mismatch", method: "fuzzy", reason: "number differs" },
  { name: "date changed (month)", quote: "The free tier ends on 2026-04-05, after that we pay for hosting", chunk: CHUNK, supports: true, result: "mismatch", method: "fuzzy", reason: "number differs" },
  { name: "number changed, 30 to 90 days", quote: "The vendor requires at least 90 days of notice before we leave", chunk: CHUNK, supports: true, result: "mismatch", method: "fuzzy", reason: "number differs" },
  { name: "negation removed", quote: "We will migrate the auth service this quarter", chunk: CHUNK, supports: true, result: "mismatch", method: "fuzzy", reason: "negation differs" },
  { name: "negation added", quote: "Do not share the staging password with anyone", chunk: "Do share the staging password with anyone outside the team.", supports: true, result: "mismatch", method: "fuzzy", reason: "negation differs" },
  { name: "negation by contraction", quote: "we don't migrate the auth service this quarter", chunk: "we do migrate the auth service this quarter, as planned", supports: true, result: "mismatch", method: "fuzzy", reason: "negation differs" },
  { name: "real quote, wrong chunk", quote: "Team agreed on Postgres, the reporting queries need joins", chunk: "Lunch is at noon on Friday. The office closes early before the holiday weekend.", supports: true, result: "mismatch", method: "none" },
  { name: "elided middle", quote: "Team agreed on Postgres ... need joins", chunk: CHUNK, supports: true, result: "mismatch" },

  // input problems
  { name: "quote too short", quote: "Use Postgres", chunk: CHUNK, supports: true, result: "mismatch", method: "none", reason: "quote too short" },
  { name: "ellipses cannot pad a short quote", quote: "...Postgres...", chunk: CHUNK, supports: true, result: "mismatch", reason: "quote too short" },
  { name: "empty quote", quote: "", chunk: CHUNK, supports: true, result: "mismatch", reason: "quote too short" },
  { name: "non-string quote", quote: null, chunk: CHUNK, supports: true, result: "mismatch", reason: "quote too short" },
  { name: "empty chunk", quote: "Team agreed on Postgres, the reporting queries need joins", chunk: "", supports: true, result: "mismatch", reason: "not available" },
  { name: "missing chunk", quote: "Team agreed on Postgres, the reporting queries need joins", chunk: undefined, supports: true, result: "mismatch", reason: "not available" },
];

for (const row of TABLE) {
  test(`matchQuote: ${row.name}`, () => {
    const m = matchQuote(row.quote, row.chunk, { supportsStatement: row.supports });
    assert.equal(m.result, row.result, JSON.stringify(m));
    if (row.method) assert.equal(m.method, row.method, JSON.stringify(m));
    if (row.reason === null) assert.equal(m.reason, null);
    else if (row.reason) assert.ok(String(m.reason).includes(row.reason), JSON.stringify(m));
  });
}

test("a fuzzy hit can never be verified, even when the support check said yes", () => {
  const m = matchQuote("Team agreed on Postgress, the reporting queries need joins", CHUNK, { supportsStatement: true });
  assert.notEqual(m.result, "verified");
  assert.equal(m.method, "fuzzy");
});

test("match object always has the five documented fields", () => {
  for (const row of TABLE) {
    const m = matchQuote(row.quote, row.chunk, { supportsStatement: row.supports });
    assert.deepEqual(Object.keys(m).sort(), ["closest", "method", "reason", "result", "score"]);
    assert.ok(m.score >= 0 && m.score <= 1);
  }
});

test("closest is a passage from the cited chunk, in readable case", () => {
  const m = matchQuote("Team agreed on Postgress, the reporting queries need joins", CHUNK, { supportsStatement: true });
  assert.ok(m.closest.includes("Postgres, the reporting queries need joins"));
});

test("closest never comes from outside the cited chunk", () => {
  const SECRET = "the admin password is hunter2 and the vault code is 4471";
  const cited = "Lunch is at noon on Friday. The office closes early before the holiday.";
  // The real quote exists only in another chunk (SECRET). Matching the cited one must not surface it.
  const m = matchQuote(SECRET, cited, { supportsStatement: true });
  assert.equal(m.result, "mismatch");
  assert.ok(!String(m.closest || "").includes("hunter2"));
});

test("closest is capped at 400 characters", () => {
  const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
  const quote = Array.from({ length: 380 }, (_, i) => `word${i}`).join(" ") + " extra";
  const m = matchQuote(quote, long, { supportsStatement: true });
  assert.ok(m.closest !== null);
  assert.ok(m.closest.length <= MAX_CLOSEST_CHARS);
});

test("a large chunk is handled quickly", () => {
  const big = Array.from({ length: 3000 }, (_, i) => `token${i % 97}`).join(" ");
  const t0 = Date.now();
  matchQuote("this sentence is not anywhere in that long repeated text at all", big, { supportsStatement: true });
  assert.ok(Date.now() - t0 < 1000);
});

test("tuning constants are sane", () => {
  assert.ok(PARTIAL_MIN > 0.5 && PARTIAL_MIN <= 1);
  assert.ok(WINDOW_LOW < 1 && WINDOW_HIGH > 1);
});