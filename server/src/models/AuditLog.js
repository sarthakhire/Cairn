const { Schema, model } = require("mongoose");

const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true }, // e.g. "review.accepted", "review.edited", "extract"
  claimId: { type: String, default: null }, // readable id such as "c_001"
  detail: { type: String, default: null }, // one readable line, shown as-is in the audit view
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  // "denied" rows record a request that the permission rules refused. Rows written
  // before this field existed have no value and are read as "allowed".
  outcome: { type: String, enum: ["allowed", "denied"], default: "allowed" },
  at: { type: Date, default: Date.now },
});

// The audit view filters by time, action and claim, newest first.
auditLogSchema.index({ at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ claimId: 1 });

module.exports = model("AuditLog", auditLogSchema);
