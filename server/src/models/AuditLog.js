const { Schema, model } = require("mongoose");

const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true }, // e.g. "review.accepted", "review.edited", "extract"
  claimId: { type: String, default: null }, // readable id such as "c_001"
  detail: { type: String, default: null }, // one readable line, shown as-is in the audit view
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  at: { type: Date, default: Date.now },
});

module.exports = model("AuditLog", auditLogSchema);