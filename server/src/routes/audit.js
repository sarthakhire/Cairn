const { Router } = require("express");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const { serializeAudit, serializeAuditEvent } = require("../services/audit");
const { parseAuditQuery, fetchAuditPage } = require("../services/auditQuery");

const router = Router();

// Reviewer only (enforced in app.js). Newest first, in the shape the audit view shows.
router.get("/", async (req, res) => {
  const rows = await AuditLog.find().sort({ at: -1, _id: -1 }).limit(200).populate("actorId", "name").lean();
  res.json(rows.map(serializeAudit));
});

// Filtered and paged, with the richer row shape. Same reviewer-only mount as above.
router.get("/events", async (req, res) => {
  const parsed = parseAuditQuery(req.query);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const page = await fetchAuditPage({ AuditLog, User }, parsed.filters);
  if (page.error) return res.status(page.status).json({ error: page.error });
  res.json({ rows: page.rows.map(serializeAuditEvent), nextCursor: page.nextCursor });
});

module.exports = router;