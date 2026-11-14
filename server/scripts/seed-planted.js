// Inserts the planted test claims (synthetic, for the verification demo) as drafts.
// Every result comes from the real matcher run on the real chunk text. Nothing is hard-coded.
// Run from server/:  npm run seed:planted             (insert or refresh, keeps claim ids)
//                    npm run seed:planted -- --remove (delete every planted claim)
// Needs MONGO_URI in server/.env and the demo sources already uploaded.
const { matchQuote, verifyQuote } = require("../src/services/verify");

// Pure: grade one entry against the text of the chunk it cites.
function gradeEntry(entry, chunkText) {
  return {
    match: matchQuote(entry.quote, chunkText, { supportsStatement: null }),
    quoteFound: verifyQuote(entry.quote, chunkText),
  };
}

async function main() {
  const path = require("path");
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const mongoose = require("mongoose");
  const Claim = require("../src/models/Claim");
  const Chunk = require("../src/models/Chunk");
  const Source = require("../src/models/Source");
  const { nextClaimId } = require("../src/services/ids");
  const entries = require("../seed-data/planted-claims.json");

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing. Put it in server/.env (that file is git-ignored).");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to database "${mongoose.connection.name}"`);

  if (process.argv.includes("--remove")) {
    const res = await Claim.deleteMany({ planted: true });
    console.log(`Removed ${res.deletedCount} planted claims.`);
    await mongoose.disconnect();
    return;
  }

  let problems = 0;
  for (const entry of entries) {
    const source = await Source.findOne({ name: entry.source }).lean();
    const chunk = source && (await Chunk.findOne({ sourceId: source._id, n: entry.chunk }).lean());
    if (!chunk) {
      console.log(`SKIPPED ${entry.id}: no chunk ${entry.chunk} in source "${entry.source}"`);
      problems++;
      continue;
    }
    const { match, quoteFound } = gradeEntry(entry, chunk.text);
    const fields = {
      type: entry.type,
      statement: entry.statement,
      visibility: chunk.sensitivity, // the claim takes the tier of the chunk it cites
      evidence: [{ chunkId: chunk._id, quote: entry.quote, quoteFound, supportsStatement: null, match }],
      planted: true,
    };
    const existing = await Claim.findOne({ planted: true, statement: entry.statement });
    let claimId;
    if (existing) {
      // Refresh in place: same claim id, and the lead's review state is left alone.
      await Claim.updateOne({ _id: existing._id }, { $set: fields });
      claimId = existing.claimId;
    } else {
      claimId = await nextClaimId();
      await Claim.create({ claimId, status: "uncertain", baseStatus: "uncertain", review: { state: "draft" }, ...fields });
    }
    const ok =
      match.result === entry.expect.result &&
      match.method === entry.expect.method &&
      String(match.reason || "").includes(entry.expect.reason);
    if (!ok) problems++;
    console.log(
      `${claimId} ${entry.id}: ${match.result} (${match.method}, score ${match.score}) ${match.reason}` +
        (ok ? "" : `   <-- UNEXPECTED, wanted ${entry.expect.result}/${entry.expect.method}/"${entry.expect.reason}"`)
    );
  }
  console.log(problems ? `${problems} problem(s), see above.` : "All planted outcomes are as expected.");
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Seed planted failed:", e.message);
    process.exit(1);
  });
}

module.exports = { gradeEntry };