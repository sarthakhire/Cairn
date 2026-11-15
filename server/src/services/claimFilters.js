const { CLAIM_TYPES, CLAIM_STATUSES, REVIEW_STATES, SENSITIVITY } = require("../constants");

// Query filters for GET /api/claims (step S2.4).
//
// The one rule that keeps this safe: filters run AFTER the permission gate, on the
// copy of each claim the caller is allowed to see. A masked restricted claim has no
// real statement, so searching for text from it finds nothing. A hidden claim is not
// in the list at all, so no filter can reveal that it exists.

const VERIFICATIONS = ["verified", "partial", "mismatch", "none"];
const SORTS = ["id", "-id"];
const MAX_Q = 100;
const MAX_VALUES = 10;

// Filter name to the values it accepts. Several values can be sent as
// review=draft,rejected or review=draft&review=rejected (OR within one filter,
// AND across different filters).
const LISTS = {
  review: REVIEW_STATES,
  verification: VERIFICATIONS,
  type: CLAIM_TYPES,
  status: CLAIM_STATUSES,
  visibility: SENSITIVITY,
};

const fail = (error) => ({ ok: false, error });
const show = (v) => (v.length > 30 ? v.slice(0, 30) + "..." : v);

function toValues(raw) {
  const parts = Array.isArray(raw) ? raw : [raw];
  return parts
    .flatMap((p) => String(p).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

// Takes req.query. Unknown parameter names are ignored (cache busters, and the
// "as" parameter that a later step handles). Unknown VALUES are a 400.
function parseClaimQuery(query = {}) {
  const filters = {};

  for (const [name, allowed] of Object.entries(LISTS)) {
    if (query[name] === undefined) continue;
    const values = toValues(query[name]);
    if (values.length === 0) continue; // "?review=" means no filter
    if (values.length > MAX_VALUES) return fail("Too many values for " + name + " (max " + MAX_VALUES + ")");
    for (const v of values) {
      if (!allowed.includes(v)) {
        return fail('Unknown ' + name + ' "' + show(v) + '". Use one of: ' + allowed.join(", "));
      }
    }
    filters[name] = [...new Set(values)];
  }

  if (query.q !== undefined) {
    if (typeof query.q !== "string") return fail("Send q once, as text");
    const q = query.q.trim();
    if (q.length > MAX_Q) return fail("q is too long (max " + MAX_Q + " characters)");
    if (q) filters.q = q.toLowerCase();
  }

  if (query.sort !== undefined && query.sort !== "") {
    if (typeof query.sort !== "string" || !SORTS.includes(query.sort)) {
      return fail('Unknown sort. Use one of: ' + SORTS.join(", "));
    }
    filters.sort = query.sort;
  }

  return { ok: true, filters };
}

const idNumber = (c) => Number(String(c.id).replace(/\D/g, "")) || 0;

// A claim that does not carry a verification (a masked restricted claim, or one
// stored before verification existed) counts as "none".
const verificationOf = (c) => (c.verification === undefined ? "none" : c.verification);

function matches(c, f) {
  if (f.review && !f.review.includes(c.review && c.review.state)) return false;
  if (f.verification && !f.verification.includes(verificationOf(c))) return false;
  if (f.type && !f.type.includes(c.type)) return false;
  if (f.status && !f.status.includes(c.status)) return false;
  if (f.visibility && !f.visibility.includes(c.visibility)) return false;
  if (f.q) {
    const text = (String(c.statement || "") + " " + String(c.id || "")).toLowerCase();
    if (!text.includes(f.q)) return false;
  }
  return true;
}

// Always returns a new array. Without a sort the original order is kept.
function applyClaimFilters(claims, filters = {}) {
  const out = claims.filter((c) => matches(c, filters));
  if (filters.sort === "id") out.sort((a, b) => idNumber(a) - idNumber(b));
  if (filters.sort === "-id") out.sort((a, b) => idNumber(b) - idNumber(a));
  return out;
}

module.exports = { VERIFICATIONS, SORTS, MAX_Q, MAX_VALUES, parseClaimQuery, applyClaimFilters };