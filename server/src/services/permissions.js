const { RESTRICTED_PLACEHOLDER, SENSITIVITY } = require("../constants");

// Rank of each visibility level, and the highest level each role may read in full.
// Role and level names follow the frontend contract (lead = the reviewer).
const RANK = { team: 1, lead_only: 2, restricted: 3 };
const ROLE_MAX = { incoming_developer: 1, incoming_lead: 2, lead: 3 };
const APPROVED = ["accepted", "edited"];

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// The one gate. Fails closed: an unknown role or level is never visible.
function canSee(role, level) {
  if (!has(ROLE_MAX, role) || !has(RANK, level)) return false;
  return RANK[level] <= ROLE_MAX[role];
}

const canReview = (role) => role === "lead";
const isApproved = (state) => APPROVED.includes(state);

// Levels worth asking the database for. Used only to narrow the query.
// viewClaim below is what actually decides, so a mistake here cannot leak.
function visibleLevels(role) {
  return SENSITIVITY.filter((l) => canSee(role, l) || l === "restricted");
}

// Built field by field, never by spreading the real claim, so nothing
// from the original can slip through when a field is added later.
function maskRestricted(c) {
  return {
    id: c.id,
    type: c.type,
    statement: RESTRICTED_PLACEHOLDER,
    status: c.status,
    evidence: [],
    visibility: "restricted",
    review: c.review,
    nextAction: null,
    conflictsWith: [],
    inference: false,
  };
}

// `closest` is source text around the quote. The reviewer approved the quote,
// not the text around it, so only the reviewer gets it. Built field by field,
// so a field added to evidence or match later is not shared by accident.
function withoutClosest(claim) {
  return {
    ...claim,
    evidence: (claim.evidence || []).map((e) => ({
      quote: e.quote,
      source: e.source,
      chunk: e.chunk,
      date: e.date,
      match: e.match
        ? { result: e.match.result, score: e.match.score, method: e.match.method, reason: e.match.reason, closest: null }
        : e.match,
    })),
  };
}

// Takes a claim already in contract shape. Returns what this role may see,
// or null when the claim must not appear at all.
function viewClaim(role, claim) {
  if (!canReview(role) && !isApproved(claim.review && claim.review.state)) return null;
  if (canSee(role, claim.visibility)) return canReview(role) ? claim : withoutClosest(claim);
  if (claim.visibility === "restricted") return maskRestricted(claim);
  return null; // lead_only for a developer: no placeholder, no count
}

// A conflict id could point at a claim this viewer cannot see. Drop those,
// otherwise the id alone would reveal that the hidden claim exists.
function stripHiddenConflicts(claim, visibleIds) {
  if (!claim.conflictsWith || claim.conflictsWith.length === 0) return claim;
  return {
    ...claim,
    conflictsWith: claim.conflictsWith.filter((id) => visibleIds.has(id)),
  };
}

function viewClaims(role, claims) {
  const seen = claims.map((c) => viewClaim(role, c)).filter(Boolean);
  const visibleIds = new Set(seen.map((c) => c.id));
  return seen.map((c) => stripHiddenConflicts(c, visibleIds));
}

module.exports = {
  RANK,
  ROLE_MAX,
  APPROVED,
  canSee,
  canReview,
  isApproved,
  visibleLevels,
  viewClaim,
  viewClaims,
  stripHiddenConflicts,
};