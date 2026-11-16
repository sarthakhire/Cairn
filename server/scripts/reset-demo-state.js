// Clears the approval history and, optionally, the audit log, so the demo can be prepared from a clean slate.
// Destructive, so it prints what it would do and only acts with --yes.
// Run from server/:  npm run reset:demo -- --versions --audit          (shows what would happen)
//                    npm run reset:demo -- --versions --audit --yes    (does it)
//   --versions  deletes every saved version and unshares the handover (so the next approval is version 1)
//   --audit     deletes every audit row, then writes one row saying that it did (nothing is cleared silently)
// Claims, sources and users are never touched. Needs MONGO_URI in server/.env.
const KNOWN = ["--versions", "--audit", "--yes"];

function parseArgs(argv) {
  const flags = argv.slice(2);
  const unknown = flags.filter((f) => !KNOWN.includes(f));
  return {
    versions: flags.includes("--versions"),
    audit: flags.includes("--audit"),
    yes: flags.includes("--yes"),
    unknown,
  };
}

async function main() {
  const path = require("path");
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const mongoose = require("mongoose");
  const Version = require("../src/models/Version");
  const Handover = require("../src/models/Handover");
  const AuditLog = require("../src/models/AuditLog");
  const User = require("../src/models/User");

  const args = parseArgs(process.argv);
  if (args.unknown.length || (!args.versions && !args.audit)) {
    if (args.unknown.length) console.error("Unknown option(s): " + args.unknown.join(", "));
    console.error("Usage: npm run reset:demo -- [--versions] [--audit] [--yes]");
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing. Put it in server/.env (that file is git-ignored).");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to database "${mongoose.connection.name}"`);

  const versions = await Version.countDocuments();
  const audits = await AuditLog.countDocuments();
  const state = await Handover.findById("handover").lean();
  console.log(`Saved versions: ${versions}   Approved version: ${state && state.approvedVersion != null ? state.approvedVersion : "none"}   Audit rows: ${audits}`);

  if (!args.yes) {
    if (args.versions) console.log(`DRY RUN: would delete ${versions} versions and unshare the handover.`);
    if (args.audit) console.log(`DRY RUN: would delete ${audits} audit rows and write one row saying so.`);
    console.log("Nothing was changed. Add --yes to do it.");
    await mongoose.disconnect();
    return;
  }

  if (args.versions) {
    await Version.deleteMany({});
    await Handover.updateOne({ _id: "handover" }, { $set: { approvedVersion: null, acknowledgements: {} } }, { upsert: true });
    console.log(`Deleted ${versions} versions and unshared the handover.`);
  }
  if (args.audit) {
    await AuditLog.deleteMany({});
    const lead = await User.findOne({ role: "lead" }).select("_id").lean();
    if (lead) {
      await AuditLog.create({
        actorId: lead._id,
        action: "Demo data reset",
        detail: "Audit history" + (args.versions ? " and approval versions were" : " was") + " cleared to prepare the demo.",
      });
    } else {
      console.log("No lead user found, so the reset itself was not logged.");
    }
    console.log(`Deleted ${audits} audit rows.`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Reset failed:", e.message);
    process.exit(1);
  });
}

module.exports = { parseArgs };