require("./processGuards").install();
require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");

const PORT = process.env.PORT || 5000;

if (!process.env.MONGO_URI) {
  console.error(
    "MONGO_URI is not set. Copy .env.example to .env (inside server/) and fill it in."
  );
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error("JWT_SECRET must be set in .env (16+ random characters).");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log("MongoDB connected");
    // From now on, requests made while the database is unreachable get an immediate 503 (see app.js).
    app.set("requireDb", true);
    app.listen(PORT, () => console.log("API running on port " + PORT));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });