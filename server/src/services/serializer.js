const { RESTRICTED_PLACEHOLDER } = require("../constants");

// Turns a stored claim into the shape in docs/api-contract.md.
// Expects evidence.chunkId populated, chunk.sourceId populated and
// review.reviewerId populated. Works on Mongoose documents and plain objects.
// This is the reviewer's full view. No role filtering or redaction here: that lives
// in permissions.js, which is what strips the reviewer-only review fields.

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

// Claims saved before the review workflow have none of the new review fields.
function serializeReview(review) {
  const r = review || {};
  const o = r.override;
  return {
    state: r.state,
    by: r.reviewerId && r.reviewerId.name ? r.reviewerId.name : null,
    at: r.at ? isoSeconds(r.at) : null,
    edited: !!r.originalStatement || r.state === "edited",
    originalStatement: r.originalStatement == null ? null : r.originalStatement,
    reason: r.reason == null ? null : r.reason,
    override: o
      ? { reason: o.reason, by: o.byName || null, at: o.at ? isoSeconds(o.at) : null }
      : null,
    history: (r.history || []).map((h) => ({
      at: isoSeconds(h.at),
      by: h.byName || null,
      action: h.action,
      fromState: h.fromState,
      toState: h.toState,
      fromStatement: h.fromStatement,
      toStatement: h.toStatement,
      reason: h.reason == null ? null : h.reason,
    })),
  };
}

function serializeClaim(c) {
  return {
    id: c.claimId,
    type: c.type,
    statement: c.statement,
    status: c.status,
    verification: claimVerification(c.evidence),
    evidence: (c.evidence || []).map(serializeEvidence),
    visibility: c.visibility,
    review: serializeReview(c.review),
    nextAction: c.nextAction || null,
    conflictsWith: Array.from(c.conflictsWith || []),
    inference: !!c.inference,
  };
}

module.exports = { serializeClaim, claimVerification, RESTRICTED_PLACEHOLDER };