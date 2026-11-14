const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const Claim = require("../src/models/Claim");
const { finalizeTier } = require("../src/services/extraction/pipeline");

const TEXT =
  "Team agreed on Postgres, the reporting queries need joins. " +
  "The vendor requires at least 30 days of notice before we leave.";
const chunk = {
  _id: new mongoose.Types.ObjectId(),
  text: TEXT,
  sensitivity: "team",
  sourceId: { formality: "formal" },
};
const generate = async () => ({ supports: true });
const cand = (statement, quote, ch = chunk) => ({
  tier: "team",
  type: "decision",
  chunk: ch,
  item: { statement, quote, chunk: "C1", subject: null, nextAction: null, inference: false },
});

async function run() {
  return finalizeTier(
    [
      cand("Postgres chosen", "Team agreed on Postgres, the reporting queries need joins"),
      cand("Postgres chosen v2", "Team agreed on Postgress, the reporting queries need joins"),
      cand("Notice is 90 days", "The vendor requires at least 90 days of notice before we leave"),
      cand("Budget approved", "Management approved a 40 percent budget increase for Q4"),
    ],
    generate
  );
}

test("finalizeTier stores a graded match on every evidence item", async () => {
  const { drafts } = await run();
  assert.equal(drafts.length, 4);
  const by = Object.fromEntries(drafts.map((d) => [d.statement, d.evidence[0].match]));
  assert.equal(by["Postgres chosen"].result, "verified");
  assert.equal(by["Postgres chosen v2"].result, "partial");
  assert.equal(by["Notice is 90 days"].reason, "number differs");
  assert.equal(by["Budget approved"].method, "none");
  for (const d of drafts) assert.ok(d.evidence[0].match);
});

test("quoteFound and match.method stay in agreement (exact iff found)", async () => {
  const { drafts } = await run();
  for (const d of drafts) {
    const e = d.evidence[0];
    assert.equal(e.quoteFound, e.match.method === "exact");
  }
});

test("a claim with no usable chunk has no evidence and so no match", async () => {
  const { drafts } = await finalizeTier(
    [cand("Orphan claim", "Team agreed on Postgres, the reporting queries need joins", null)],
    generate
  );
  for (const d of drafts) assert.deepEqual(d.evidence, []);
});

const baseClaim = (evidence) => ({
  claimId: "c_900",
  type: "decision",
  statement: "Postgres chosen",
  visibility: "team",
  evidence,
});
const ev = { chunkId: new mongoose.Types.ObjectId(), quote: "x".repeat(20), quoteFound: false };

test("an old claim without match still validates", async () => {
  await new Claim(baseClaim([ev])).validate();
});

test("a claim with a match validates", async () => {
  const match = { result: "partial", score: 0.9, method: "fuzzy", reason: "wording differs", closest: "text" };
  await new Claim(baseClaim([{ ...ev, match }])).validate();
});

test("a match with an unknown result is rejected", async () => {
  const match = { result: "great", score: 0.9, method: "fuzzy" };
  await assert.rejects(new Claim(baseClaim([{ ...ev, match }])).validate());
});