// Puts the demo data back exactly as saved in the snapshot. Users are not touched.
//   npm run restore:demo                    shows what it would do (changes nothing)
//   npm run restore:demo -- --yes           does it
//   npm run restore:demo -- --yes --file backup/demo-snapshot.json
// Needs MONGO_URI in server/.env and the users from npm run seed.
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const demo = require("../src/services/demoRestore");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing. Put it in server/.env (that file is git-ignored).");
    process.exit(1);
  }
  const candidates = [arg("--file"), demo.SNAPSHOT_FILE, path.join(__dirname, "..", "..", "backup", "demo-snapshot.json")].filter(Boolean);
  const file = candidates.map((f) => path.resolve(f)).find((f) => fs.existsSync(f));
  if (!file) {
    console.error("No snapshot found. Looked in:\n  " + candidates.join("\n  ") + "\nCreate one with: npm run export:demo");
    process.exit(1);
  }

  const text = demo.loadSnapshotText(file);
  const snapshot = demo.parseSnapshot(text);
  await mongoose.connect(process.env.MONGO_URI);

  const models = {};
  for (const name of [...demo.REQUIRED, ...demo.OPTIONAL, "User"]) models[name] = require("../src/models/" + name);

  console.log('Database:  "' + mongoose.connection.name + '"');
  console.log("Snapshot:  " + file + (snapshot.exportedAt ? " (saved " + snapshot.exportedAt + ")" : ""));
  console.log("");
  console.log("Collection      now   -> after restore");
  for (const name of [...demo.REQUIRED, ...demo.OPTIONAL]) {
    const incoming = snapshot.collections[name];
    const now = await models[name].countDocuments({});
    console.log("  " + name.padEnd(10) + String(now).padStart(6) + "   -> " + (incoming ? incoming.length : "(left alone)"));
  }
  console.log("");

  if (!process.argv.includes("--yes")) {
    console.log('Nothing was changed. Check the database name above, then run again with --yes to restore.');
    await mongoose.disconnect();
    return;
  }

  const result = await demo.restoreDemo({ models, text });
  console.log("Restored." + (result.transactional ? "" : " (No transaction was available, so this was not all-or-nothing.)"));
  const after = {};
  for (const name of Object.keys(result.counts)) after[name] = await models[name].countDocuments({});
  const bad = Object.keys(result.counts).filter((n) => after[n] !== result.counts[n]);
  if (bad.length) console.error("WARNING: counts differ for " + bad.join(", ") + ": " + JSON.stringify(after));

  // Every record that points at a user must point at a user that exists now.
  const ids = (await models.User.find({}).select("_id").lean()).map((u) => u._id);
  const checks = [["Claim", "review.reviewerId"], ["Source", "uploadedBy"], ["Version", "by"], ["AuditLog", "actorId"]];
  let dangling = 0;
  for (const [name, field] of checks) {
    if (!result.counts[name]) continue;
    const n = await models[name].countDocuments({ [field]: { $ne: null, $nin: ids } });
    if (n) {
      dangling += n;
      console.error("WARNING: " + n + " " + name + " record(s) point at a user that does not exist (" + field + ").");
    }
  }
  if (!bad.length && !dangling) console.log("Checks passed: counts match and every user reference resolves.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Restore failed:", e.message);
  process.exit(1);
});