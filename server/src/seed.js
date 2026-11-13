require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("./models/User");

// Emails match the demo accounts the frontend already shows (client/src/lib/users.js).
const USERS = [
  { name: "Demo Lead", email: "lead@demo.test", role: "lead" },
  { name: "Demo Incoming lead", email: "incoming.lead@demo.test", role: "incoming_lead" },
  { name: "Demo Incoming developer", email: "incoming.dev@demo.test", role: "incoming_developer" },
];
// Accounts from the first version of this seed, removed so no stale logins remain.
const OLD_EMAILS = ["lead@cairn.demo", "incoming-lead@cairn.demo", "incoming-dev@cairn.demo"];

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");

  // Set SEED_PASSWORD in .env to know the password. Otherwise one is generated and printed once.
  const generated = !process.env.SEED_PASSWORD;
  const password = process.env.SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);

  await mongoose.connect(process.env.MONGO_URI);
  await User.deleteMany({ email: { $in: OLD_EMAILS } });
  for (const u of USERS) {
    await User.updateOne({ email: u.email }, { $set: { ...u, passwordHash } }, { upsert: true });
  }
  console.log("Seeded " + USERS.length + " users: " + USERS.map((u) => u.email).join(", "));
  if (generated) console.log("Generated password (shown once): " + password);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});