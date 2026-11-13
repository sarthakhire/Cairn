const AuditLog = require("../models/AuditLog");

// The one place that writes audit rows. Action names are the labels the audit
// view shows ("Accepted", "Handover approved", ...).
async function record({ actorId, action, claimId = null, detail = null, before = null, after = null }) {
  await AuditLog.create({ actorId, action, claimId, detail, before, after });
}

const isoSeconds = (d) => new Date(d).toISOString().slice(0, 19);

// Rows written before labels existed (the extraction run) get a readable form.
function serializeAudit(row) {
  let action = row.action;
  let detail = row.detail || null;
  if (action === "extract") {
    action = "Extraction run";
    const a = row.after;
    if (!detail && a && a.claimsCreated !== undefined) {
      detail = a.claimsCreated + " claims created, " + a.verified + " verified, " + a.draftsReplaced + " drafts replaced";
    }
  }
  return {
    at: isoSeconds(row.at),
    actor: row.actorId && row.actorId.name ? row.actorId.name : "Unknown",
    action,
    detail,
  };
}

module.exports = { record, serializeAudit };
