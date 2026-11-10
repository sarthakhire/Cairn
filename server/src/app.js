const express = require("express");
const cors = require("cors");
const { auth } = require("./middleware/auth");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/claims", auth, require("./routes/claims"));

// Unknown /api routes get JSON, not Express's default HTML page.
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Error shape for every failure: { error: "message" }.
// Never send err.message or stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request too large" });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

module.exports = app;