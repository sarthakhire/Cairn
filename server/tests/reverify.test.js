const test = require("node:test");
const assert = require("node:assert");
const { computeUpdates } = require("../scripts/reverify");

const TEXT =
  "Team agreed on Postgres, the reporting queries need joins. " +
  "The vendor requires at least 30 days of notice before we leave.";
const chunkById = new Map([["chunk1", { text: TEXT }]]);

const claims = () => [
  {
    _id: "A", claimId: "c_001", status: "verified", visibility: "team",
    evidence: [{ chunkId: "chunk1", quote: "Team agreed on Postgres, the reporting queries need joins", quoteFound: true, supportsStatement: true }],
  },
  {
    // Old flags said verified, but the quote changed 30 to 90. The new check must catch it.
    _id: "B", claimId: "c_002", status: "verified", visibility: "team",
    evidence: [{ chunkId: "chunk1", quote: "The vendor requires at least 90 days of notice before we leave", quoteFound: true, supportsStatement: true }],
  },
  {
    _id: "C", claimId: "c_003", status: "uncertain", visibility: "team",
    evidence: [{ chunkId: "gone", quote: "some quote that is long enough", quoteFound: false, supportsStatement: null }],
  },
  { _id: "D", claimId: "c_004", status: "missing", visibility: "team", evidence: [] },
];

function apply(cs, ops) {
  for (const op of ops) {
    const { filter, update } = op.updateOne;
    const claim = cs.find((c) => c._id === filter._id);
    for (const [path, value] of Object.entries(update.$set)) {
      const i = Number(path.split(".")[1]);
      claim.evidence[i].match = value;
    }
  }
}

test("reverify computes a match for every item with chunk text and reports flips", () => {
  const { ops, report } = computeUpdates(claims(), chunkById);
  assert.equal(report.claims, 4);
  assert.equal(report.items, 3);
  assert.equal(report.skippedNoChunk, 1);
  assert.deepEqual(report.results, { verified: 1, partial: 0, mismatch: 1 });
  assert.equal(report.toUpdate, 2);
  assert.equal(ops.length, 2);
  assert.deepEqual(report.rollupChanged, [{ claimId: "c_002", from: "verified", to: "mismatch" }]);
  assert.deepEqual(report.verifiedButNot, [{ claimId: "c_002", visibility: "team", verification: "mismatch" }]);
});

test("reverify is idempotent: a second run changes nothing", () => {
  const cs = claims();
  apply(cs, computeUpdates(cs, chunkById).ops);
  const second = computeUpdates(cs, chunkById);
  assert.equal(second.ops.length, 0);
  assert.equal(second.report.toUpdate, 0);
  assert.equal(second.report.unchanged, 2);
});

test("reverify only ever sets evidence.N.match", () => {
  const { ops } = computeUpdates(claims(), chunkById);
  for (const op of ops) {
    const keys = Object.keys(op.updateOne.update.$set);
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^evidence\.\d+\.match$/);
    assert.deepEqual(Object.keys(op.updateOne.update), ["$set"]);
  }
});

test("an item whose chunk is gone is skipped, never overwritten", () => {
  const { ops } = computeUpdates([claims()[2]], chunkById);
  assert.equal(ops.length, 0);
});