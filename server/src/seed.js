require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("./models/User");

const USERS = [
  { name: "Lead", email: "lead@cairn.demo", role: "lead" },
  { name: "Incoming Lead", email: "incoming-lead@cairn.demo", role: "incoming_lead" },
  { name: "Incoming Developer", email: "incoming-dev@cairn.demo", role: "incoming_developer" },
];

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");

  // Set SEED_PASSWORD in .env to know the password. Otherwise one is generated and printed once.
  const generated = !process.env.SEED_PASSWORD;
  const password = process.env.SEED_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);

  await mongoose.connect(process.env.MONGO_URI);
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