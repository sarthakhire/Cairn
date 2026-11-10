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
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log("API running on port " + PORT));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });