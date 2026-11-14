// Recomputes evidence[].match for every stored claim from the real chunk text.
// Idempotent: a second run changes nothing. Never touches status or anything else.
// Run from server/:  npm run reverify -- --dry-run   (prints counts, writes nothing)
//                    npm run reverify                 (writes)
// Needs MONGO_URI in server/.env.
const { matchQuote } = require("../src/services/verify");

const RANK = { mismatch: 1, partial: 2, verified: 3 };

// What a claim without a stored match was treated as (same rules as the serializer).
function legacyResult(e) {
  if (e.quoteFound === true) {
    if (e.supportsStatement === true) return "verified";
    if (e.supportsStatement === false) return "mismatch";
    return "partial";
  }
  return "mismatch";
}

function rollup(results) {
  let best = null;
  for (const r of results) if (best === null || RANK[r] > RANK[best]) best = r;
  return best === null ? "none" : best;
}

const sameMatch = (a, b) =>
  !!a &&
  a.result === b.result &&
  a.score === b.score &&
  a.method === b.method &&
  (a.reason ?? null) === (b.reason ?? null) &&
  (a.closest ?? null) === (b.closest ?? null);

// Pure: no database. claims are plain objects, chunkById maps String(id) -> { text }.
function computeUpdates(claims, chunkById) {
  const report = {
    claims: claims.length,
    items: 0,
    skippedNoChunk: 0,
    results: { verified: 0, partial: 0, mismatch: 0 },
    toUpdate: 0,
    unchanged: 0,
    rollupChanged: [],
    verifiedButNot: [],
  };
  const ops = [];

  for (const c of claims) {
    const before = [];
    const after = [];
    (c.evidence || []).forEach((e, i) => {
      report.items++;
      const was = e.match && e.match.result ? e.match.result : legacyResult(e);
      before.push(was);
      const chunk = chunkById.get(String(e.chunkId));
      if (!chunk) {
        report.skippedNoChunk++;
        after.push(was);
        return;
      }
      const m = matchQuote(e.quote, chunk.text, { supportsStatement: e.supportsStatement });
      report.results[m.result]++;
      after.push(m.result);
      if (sameMatch(e.match, m)) {
        report.unchanged++;
      } else {
        report.toUpdate++;
        ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: { [`evidence.${i}.match`]: m } } } });
      }
    });
    const b = rollup(before);
    const a = rollup(after);
    if (a !== b) report.rollupChanged.push({ claimId: c.claimId, from: b, to: a });
    if (c.status === "verified" && a !== "verified") {
      report.verifiedButNot.push({ claimId: c.claimId, visibility: c.visibility, verification: a });
    }
  }
  return { ops, report };
}

async function main() {
  const path = require("path");
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const mongoose = require("mongoose");
  const Claim = require("../src/models/Claim");
  const Chunk = require("../src/models/Chunk");

  const dry = process.argv.includes("--dry-run");
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing. Put it in server/.env (that file is git-ignored).");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to database "${mongoose.connection.name}" on ${mongoose.connection.host}`);

  const claims = await Claim.find({}).select("claimId status visibility evidence").lean();
  const ids = [...new Set(claims.flatMap((c) => (c.evidence || []).map((e) => String(e.chunkId))))];
  const chunks = await Chunk.find({ _id: { $in: ids } }).select("text").lean();
  const chunkById = new Map(chunks.map((c) => [String(c._id), c]));

  const { ops, report } = computeUpdates(claims, chunkById);
  console.log(`Claims: ${report.claims}   Evidence items: ${report.items}`);
  console.log(`Chunk missing (left as they were): ${report.skippedNoChunk}`);
  console.log(`Match results: verified ${report.results.verified}, partial ${report.results.partial}, mismatch ${report.results.mismatch}`);
  console.log(`To update: ${report.toUpdate}   Already up to date: ${report.unchanged}`);
  if (report.rollupChanged.length) {
    console.log("Claims whose verification changes:");
    for (const r of report.rollupChanged) console.log(`  ${r.claimId}: ${r.from} -> ${r.to}`);
  }
  if (report.verifiedButNot.length) {
    console.log("Status is 'verified' but the new check disagrees:");
    for (const r of report.verifiedButNot) console.log(`  ${r.claimId} (${r.visibility}): verification ${r.verification}`);
  }

  if (dry) {
    console.log("DRY RUN: nothing was written.");
  } else if (ops.length) {
    // Native driver on purpose: only `match` is set, updatedAt is left alone.
    const res = await Claim.collection.bulkWrite(ops, { ordered: false });
    console.log(`Written: ${res.modifiedCount} evidence items updated.`);
  } else {
    console.log("Nothing to write.");
  }
  const missing = await Claim.countDocuments({ evidence: { $elemMatch: { match: null } } });
  console.log(`Claims that still have evidence without a match: ${missing}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Reverify failed:", e.message);
    process.exit(1);
  });
}

module.exports = { computeUpdates };