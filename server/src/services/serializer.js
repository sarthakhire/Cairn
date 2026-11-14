const { RESTRICTED_PLACEHOLDER } = require("../constants");

// Turns a stored claim into the shape in docs/api-contract.md.
// Expects evidence.chunkId populated, chunk.sourceId populated and
// review.reviewerId populated. Works on Mongoose documents and plain objects.
// No role filtering or redaction here: that lives in permissions.js.

const isoDate = (d) => new Date(d).toISOString().slice(0, 10); // 2026-02-03
const isoSeconds = (d) => new Date(d).toISOString().slice(0, 19); // 2026-03-02T18:40:00

// Claims saved before Round 3 have no stored `match`. Derive one from the flags
// they do have, using the same rules as matchQuote, so the answer does not
// change when the backfill (npm run reverify) later stores a real one.
function legacyMatch(e) {
  if (e.quoteFound === true) {
    if (e.supportsStatement === true) {
      return { result: "verified", score: 1, method: "exact", reason: null, closest: null };
    }
    if (e.supportsStatement === false) {
      return { result: "mismatch", score: 1, method: "exact", reason: "quote found but does not support the statement", closest: null };
    }
    return { result: "partial", score: 1, method: "exact", reason: "support check not run", closest: null };
  }
  return { result: "mismatch", score: 0, method: "none", reason: "quote not found in the cited source", closest: null };
}

function evidenceMatch(e) {
  const m = e.match;
  if (m && m.result) {
    return {
      result: m.result,
      score: m.score,
      method: m.method,
      reason: m.reason == null ? null : m.reason,
      closest: m.closest == null ? null : m.closest,
    };
  }
  return legacyMatch(e);
}

const RANK = { mismatch: 1, partial: 2, verified: 3 };

// The BEST result across a claim's evidence, because a claim is verified when
// any one evidence item is. No evidence at all (gap types) gives "none".
function claimVerification(evidence) {
  let best = null;
  for (const e of evidence || []) {
    if (!e) continue;
    const r = evidenceMatch(e).result;
    if (best === null || RANK[r] > RANK[best]) best = r;
  }
  return best === null ? "none" : best;
}

function serializeEvidence(e) {
  const chunk = e.chunkId;
  const source = chunk.sourceId;
  const when = chunk.timestamp || source.createdAt || null;
  return {
    quote: "..." + e.quote + "...", // the mock shows excerpts wrapped in ellipses
    source: source.name,
    chunk: chunk.n,
    date: when ? isoDate(when) : null,
    match: evidenceMatch(e),
  };
}

function serializeClaim(c) {
  const review = c.review || {};
  return {
    id: c.claimId,
    type: c.type,
    statement: c.statement,
    status: c.status,
    verification: claimVerification(c.evidence),
    evidence: (c.evidence || []).map(serializeEvidence),
    visibility: c.visibility,
    review: {
      state: review.state,
      by: review.reviewerId && review.reviewerId.name ? review.reviewerId.name : null,
      at: review.at ? isoSeconds(review.at) : null,
    },
    nextAction: c.nextAction || null,
    conflictsWith: Array.from(c.conflictsWith || []),
    inference: !!c.inference,
  };
}

module.exports = { serializeClaim, claimVerification, RESTRICTED_PLACEHOLDER };