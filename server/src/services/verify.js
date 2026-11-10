const MIN_QUOTE_LENGTH = 15;

function normalise(t) {
  return String(t)
    .normalize("NFKC") // also turns the single "…" character into "..."
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Models (and the mock data) wrap excerpts in "..." . Those dots are not part
// of the source text, so remove them before matching. Dots in the middle of a
// quote are kept, which means a quote with an elided middle fails (fail closed).
function stripEdgeEllipsis(t) {
  return t.replace(/^(?:\.{3,}\s*)+/, "").replace(/(?:\s*\.{3,})+$/, "");
}

function verifyQuote(quote, chunkText) {
  if (typeof quote !== "string" || typeof chunkText !== "string") return false;
  const core = stripEdgeEllipsis(normalise(quote));
  if (core.length < MIN_QUOTE_LENGTH) return false; // too short to mean anything
  return normalise(chunkText).includes(core);
}

// The contract rule: a claim may be "verified" only if at least one evidence
// item has a quote found in its chunk AND the support check said yes.
// If you cut the support-check call (see "If you fall behind"), set
// supportsStatement to true from the reviewer flag instead of loosening this.
function hasVerifiedEvidence(evidence) {
  return (evidence || []).some(
    (e) => e && e.quoteFound === true && e.supportsStatement === true
  );
}

module.exports = { verifyQuote, hasVerifiedEvidence, MIN_QUOTE_LENGTH };