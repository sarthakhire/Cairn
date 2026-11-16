const express = require("express");
const cors = require("cors");
const { STATUS_CODES } = require("http");
const mongoose = require("mongoose");
const { auth, requireRole } = require("./middleware/auth");

const app = express();

// CORS_ORIGIN is a comma-separated list of the sites allowed to call this API, for example
// https://cairn-handovertrail.netlify.app. When it is not set (local development) any site may call it.
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: "2mb" }));

// Liveness plus a quick look at the database connection. No query is made, so it answers fast even
// when the database is down. It stays ok:true then, so the host does not restart a healthy server
// because of a database blip. The client waits for db "up" before it lets anyone log in.
const DB_STATE = { 1: "up", 2: "connecting" };
const DB_DOWN_MESSAGE = "The database is not reachable right now. Try again in a moment.";
// Errors the driver raises when it cannot reach the database, including a command that waited too long.
const DB_ERRORS = new Set(["MongooseServerSelectionError", "MongoServerSelectionError", "MongoNetworkError", "MongoNetworkTimeoutError"]);
app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, db: DB_STATE[mongoose.connection.readyState] || "down" });
});
// When the database is unreachable, answer at once instead of letting every request wait for a
// timeout. index.js switches this on after the first successful connection, so tests are unaffected.
app.use("/api", (req, res, next) => {
  if (app.get("requireDb") && mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: DB_DOWN_MESSAGE });
  }
  next();
});
app.use("/api/auth", require("./routes/auth"));
app.use("/api/sources", auth, requireRole("lead"), require("./routes/sources"));
app.use("/api/claims", auth, require("./routes/claims"));
app.use("/api/approval", auth, require("./routes/approval"));
app.use("/api/audit", auth, requireRole("lead"), require("./routes/audit"));
app.use("/api/extract", auth, requireRole("lead"), require("./routes/extract"));

// Restores the demo data. Does not exist (404 for everyone) unless ALLOW_DEMO_RESET=true.
app.use(
  "/api/demo",
  (req, res, next) => (process.env.ALLOW_DEMO_RESET === "true" ? next() : res.status(404).json({ error: "Not found" })),
  auth,
  requireRole("lead"),
  require("./routes/demo")
);

// Anything else gets JSON, not Express's default HTML page.
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Error shape for every failure: { error: "message" }.
// Never send err.message or stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request too large" });
  }

    if (DB_ERRORS.has(err.name) || /buffering timed out/.test(err.message || "")) {
    console.error("database unreachable:", err.message);
    return res.status(503).json({ error: DB_DOWN_MESSAGE });
  }
  // Other client errors raised by Express and the body parser (unsupported charset or encoding,
  // a malformed URL escape, an aborted request) carry a 4xx status. Say what it is, never err.message.
  const status = err.status || err.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: STATUS_CODES[status] || "Bad request" });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

module.exports = app;