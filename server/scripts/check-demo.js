// Reads the demo database and says whether it is in the state judges should find. Read-only.
// Run from server/:  npm run check:demo        (exit code 1 if anything failed)
// Needs MONGO_URI in server/.env. Prints ids and counts only, never claim text.
const { checkDemoState, summarise } = require("../src/services/demoCheck");

async function main() {
  const path = require("path");
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const mongoose = require("mongoose");
  const User = require("../src/models/User");
  const Source = require("../src/models/Source");
  const Version = require("../src/models/Version");
  const AuditLog = require("../src/models/AuditLog");
  const { loadSerialized } = require("../src/services/claimStore");
  const { currentApproval } = require("../src/services/handover");
  const planted = require("../seed-data/planted-claims.json");

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing. Put it in server/.env (that file is git-ignored).");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Checking database "${mongoose.connection.name}"\n`);

  const latest = await Version.findOne().sort({ number: -1 }).select("number").lean();
  const data = {
    users: await User.find().select("email role").lean(),
    sourceCount: await Source.countDocuments(),
    live: await loadSerialized({}),
    approval: await currentApproval(),
    latestVersionNumber: latest ? latest.number : null,
    auditRows: await AuditLog.find().select("action outcome").lean(),
    planted,
  };
  await mongoose.disconnect();

  const results = checkDemoState(data);
  const mark = { pass: "PASS", warn: "WARN", fail: "FAIL" };
  for (const r of results) console.log(`${mark[r.level]}  ${r.label}${r.detail ? " - " + r.detail : ""}`);
  const s = summarise(results);
  console.log(`\n${s.pass} passed, ${s.warn} warnings, ${s.fail} failed`);
  if (s.fail > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Check failed:", e.message);
    process.exit(1);
  });
}