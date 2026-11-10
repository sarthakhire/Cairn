const { RESTRICTED_PLACEHOLDER } = require("../constants");

// Turns a stored claim into the shape in docs/api-contract.md.
// Expects evidence.chunkId populated, chunk.sourceId populated and
// review.reviewerId populated. Works on Mongoose documents and plain objects.
// No role filtering or redaction here: that lives in permissions.js.

const isoDate = (d) => new Date(d).toISOString().slice(0, 10); // 2026-02-03
const isoSeconds = (d) => new Date(d).toISOString().slice(0, 19); // 2026-03-02T18:40:00

function serializeEvidence(e) {
  const chunk = e.chunkId;
  const source = chunk.sourceId;
  const when = chunk.timestamp || source.createdAt || null;
  return {
    quote: "..." + e.quote + "...", // the mock shows excerpts wrapped in ellipses
    source: source.name,
    chunk: chunk.n,
    date: when ? isoDate(when) : null,
  };
}

function serializeClaim(c) {
  const review = c.review || {};
  return {
    id: c.claimId,
    type: c.type,
    statement: c.statement,
    status: c.status,
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

module.exports = { serializeClaim, RESTRICTED_PLACEHOLDER };