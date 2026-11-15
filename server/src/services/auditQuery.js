// Filtering and paging for GET /api/audit/events. The query rules and the Mongo filter are pure;
// fetchAuditPage takes the models as arguments so it can be tested without a database.

const ALLOWED_KEYS = ["actor", "action", "claimId", "outcome", "from", "to", "limit", "before"];
const OUTCOMES = ["allowed", "denied"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CLAIM_ID = /^c_\d+$/;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const fail = (error) => ({ ok: false, error });

// "2026-02-30" must not silently become March 2.
function realCalendarDate(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// A date ("2026-11-14") or a date and time. A time with no zone is read as UTC, the same
// way the app shows every time. Returns { date, dateOnly } or null.
function parseWhen(value) {
  const m = DATE.exec(value);
  if (!m) return null;
  const [, y, mo, d, time, zone] = m;
  if (!realCalendarDate(Number(y), Number(mo), Number(d))) return null;
  const iso = time && !zone ? value + "Z" : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { date, dateOnly: !time };
}

function parseAuditQuery(query) {
  const q = query || {};
  for (const key of Object.keys(q)) {
    if (!ALLOWED_KEYS.includes(key)) return fail('Unknown parameter "' + key + '"');
  }
  const get = (key) => {
    const v = q[key];
    if (v === undefined) return { value: undefined };
    if (typeof v !== "string") return { error: 'Bad value for "' + key + '"' };
    const t = v.trim();
    return { value: t === "" ? undefined : t };
  };

  const out = {};
  for (const key of ALLOWED_KEYS) {
    const got = get(key);
    if (got.error) return fail(got.error);
    out[key] = got.value;
  }

  if (out.actor !== undefined && out.actor.length > 100) return fail('"actor" is too long');
  if (out.action !== undefined && out.action.length > 100) return fail('"action" is too long');
  if (out.claimId !== undefined && !CLAIM_ID.test(out.claimId)) return fail('"claimId" must look like c_001');
  if (out.outcome !== undefined && !OUTCOMES.includes(out.outcome)) return fail('"outcome" must be "allowed" or "denied"');
  if (out.before !== undefined && !OBJECT_ID.test(out.before)) return fail('"before" must be an id from a previous page');

  let limit = DEFAULT_LIMIT;
  if (out.limit !== undefined) {
    if (!/^\d+$/.test(out.limit) || Number(out.limit) < 1) return fail('"limit" must be a whole number of 1 or more');
    limit = Math.min(Number(out.limit), MAX_LIMIT); // above the cap is cut to the cap
  }

  let from = null;
  let to = null;
  let toExclusive = false;
  if (out.from !== undefined) {
    const w = parseWhen(out.from);
    if (!w) return fail('"from" must be a date like 2026-11-14 or 2026-11-14T10:00:00');
    from = w.date;
  }
  if (out.to !== undefined) {
    const w = parseWhen(out.to);
    if (!w) return fail('"to" must be a date like 2026-11-14 or 2026-11-14T10:00:00');
    to = w.date;
    if (w.dateOnly) {
      // "to 2026-11-14" means through the end of that day.
      to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
      toExclusive = true;
    }
  }
  if (from && to && from.getTime() >= to.getTime() && !(to.getTime() === from.getTime() && !toExclusive)) {
    return fail('"from" must be before "to"');
  }

  return {
    ok: true,
    filters: {
      actor: out.actor,
      action: out.action,
      claimId: out.claimId,
      outcome: out.outcome,
      from,
      to,
      toExclusive,
      limit,
      before: out.before,
    },
  };
}

// The Mongo filter. `actorIds` come from a name lookup; `cursor` is the row the previous page ended on.
function buildFilter(f, { actorIds = null, cursor = null } = {}) {
  const and = [];
  if (actorIds) and.push({ actorId: { $in: actorIds } });
  // The extraction run is stored as "extract" and shown as "Extraction run".
  if (f.action) and.push({ action: f.action === "Extraction run" ? "extract" : f.action });
  if (f.claimId) and.push({ claimId: f.claimId });
  // Rows written before the outcome field existed have no value and count as allowed.
  if (f.outcome === "denied") and.push({ outcome: "denied" });
  if (f.outcome === "allowed") and.push({ outcome: { $ne: "denied" } });
  if (f.from || f.to) {
    const at = {};
    if (f.from) at.$gte = f.from;
    if (f.to) at[f.toExclusive ? "$lt" : "$lte"] = f.to;
    and.push({ at });
  }
  // Newest first by (at, _id). The cursor is a row id; the filter continues strictly after that row.
  if (cursor) and.push({ $or: [{ at: { $lt: cursor.at } }, { at: cursor.at, _id: { $lt: cursor._id } }] });
  return and.length ? { $and: and } : {};
}

// One page. Reads limit + 1 rows so it knows whether another page exists without an empty last page.
async function fetchAuditPage({ AuditLog, User }, f) {
  let actorIds = null;
  if (f.actor) {
    const users = await User.find({ name: f.actor }).select("_id").lean();
    if (users.length === 0) return { rows: [], nextCursor: null };
    actorIds = users.map((u) => u._id);
  }
  let cursor = null;
  if (f.before) {
    cursor = await AuditLog.findById(f.before).select("at").lean();
    if (!cursor) return { error: "Unknown cursor", status: 400 };
  }
  const docs = await AuditLog.find(buildFilter(f, { actorIds, cursor }))
    .sort({ at: -1, _id: -1 })
    .limit(f.limit + 1)
    .populate("actorId", "name role")
    .lean();
  const rows = docs.slice(0, f.limit);
  const nextCursor = docs.length > f.limit ? String(rows[rows.length - 1]._id) : null;
  return { rows, nextCursor };
}

module.exports = { parseAuditQuery, buildFilter, fetchAuditPage, DEFAULT_LIMIT, MAX_LIMIT };