const express = require("express");
const cors = require("cors");
const { auth, requireRole } = require("./middleware/auth");

const app = express();

// CORS_ORIGIN is a comma-separated list of the sites allowed to call this API, for example
// https://cairn-handovertrail.netlify.app. When it is not set (local development) any site may call it.
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/sources", auth, requireRole("lead"), require("./routes/sources"));
app.use("/api/claims", auth, require("./routes/claims"));
app.use("/api/approval", auth, require("./routes/approval"));
app.use("/api/audit", auth, requireRole("lead"), require("./routes/audit"));
app.use("/api/extract", auth, requireRole("lead"), require("./routes/extract"));

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