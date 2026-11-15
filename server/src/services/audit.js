const AuditLog = require("../models/AuditLog");

// The one place that writes audit rows. Action names are the labels the audit
// view shows ("Accepted", "Handover approved", ...).
async function record({ actorId, action, claimId = null, detail = null, before = null, after = null, outcome = "allowed" }) {
  const doc = { actorId, action, claimId, detail, before, after };
  // "allowed" is the schema default, so ordinary rows are written exactly as before.
  if (outcome !== "allowed") doc.outcome = outcome;
  await AuditLog.create(doc);
}

// ---- Denied requests -------------------------------------------------------------
// A refused request is worth a row, but a person hammering one URL must not flood the
// log. The same actor and the same text is written once per minute.
const DENIAL_WINDOW_MS = 60_000;
const MAX_TRACKED = 1000;
const recentDenials = new Map();

function firstDenial(key, now) {
  const last = recentDenials.get(key);
  if (last !== undefined && now - last < DENIAL_WINDOW_MS) return false;
  if (recentDenials.size >= MAX_TRACKED) {
    for (const [k, t] of recentDenials) if (now - t >= DENIAL_WINDOW_MS) recentDenials.delete(k);
    if (recentDenials.size >= MAX_TRACKED) recentDenials.clear();
  }
  recentDenials.set(key, now);
  return true;
}

const cleanPath = (url) => String(url || "").split("?")[0].slice(0, 200); // never log a query string
const CLAIM_PATH = /^\/api\/claims\/(c_\d+)(?:\/|$)/;

// Fire and forget. It never throws and never makes the caller wait, so a database
// problem in the audit log cannot turn a 403 or a 404 into a 500. Requests with no
// signed-in user (401) have no actor and are not logged.
function recordDenied({ actorId, role, method, url, action = "Access denied", claimId = null, detail = null, now = Date.now() }) {
  try {
    if (!actorId) return;
    const path = cleanPath(url);
    const text = detail || String(role) + " tried " + String(method || "").toUpperCase() + " " + path;
    if (!firstDenial(actorId + "|" + action + "|" + text, now)) return;
    const fromPath = CLAIM_PATH.exec(path);
    Promise.resolve(
      record({ actorId, action, claimId: claimId || (fromPath ? fromPath[1] : null), detail: text, outcome: "denied" })
    ).catch((err) => console.error("audit: could not record a denied request:", err.message));
  } catch (err) {
    console.error("audit: could not record a denied request:", err.message);
  }
}

// For tests.
const resetDenialMemory = () => recentDenials.clear();

// ---- Reading rows ----------------------------------------------------------------
const isoSeconds = (d) => new Date(d).toISOString().slice(0, 19);

// Rows written before labels existed (the extraction run) get a readable form.
function describe(row) {
  let action = row.action;
  let detail = row.detail || null;
  if (action === "extract") {
    action = "Extraction run";
    const a = row.after;
    if (!detail && a && a.claimsCreated !== undefined) {
      detail = a.claimsCreated + " claims created, " + a.verified + " verified, " + a.draftsReplaced + " drafts replaced";
    }
  }
  return { action, detail };
}

const actorName = (row) => (row.actorId && row.actorId.name ? row.actorId.name : "Unknown");

// The original shape used by GET /api/audit. Unchanged on purpose: the live client reads it.
function serializeAudit(row) {
  const { action, detail } = describe(row);
  return { at: isoSeconds(row.at), actor: actorName(row), action, detail };
}

// The richer shape for the filtered audit view. Needs actorId populated with name and role.
function serializeAuditEvent(row) {
  const { action, detail } = describe(row);
  return {
    id: row._id ? String(row._id) : null,
    at: isoSeconds(row.at),
    actor: actorName(row),
    role: row.actorId && row.actorId.role ? row.actorId.role : null,
    action,
    outcome: row.outcome || "allowed",
    claimId: row.claimId || null,
    detail,
  };
}

module.exports = { record, recordDenied, resetDenialMemory, serializeAudit, serializeAuditEvent, DENIAL_WINDOW_MS };