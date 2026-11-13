const { Router } = require("express");
const AuditLog = require("../models/AuditLog");
const { serializeAudit } = require("../services/audit");

const router = Router();

// Reviewer only (enforced in app.js). Newest first, in the shape the audit view shows.
router.get("/", async (req, res) => {
  const rows = await AuditLog.find().sort({ at: -1, _id: -1 }).limit(200).populate("actorId", "name").lean();
  res.json(rows.map(serializeAudit));
});

module.exports = router;
