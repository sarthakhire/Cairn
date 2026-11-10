// Types that may be reported without a quote: they describe something that is absent.
const GAP_TYPES = ["open_question", "ownership"];

// Returns the status for one extracted claim, or null when it must be dropped.
//   no quote            -> "missing" for gap types, otherwise dropped (an invented decision)
//   chunk or quote bad  -> uncertain
//   support check != yes -> uncertain (also when the check could not run)
//   informal source     -> uncertain
//   otherwise           -> verified
// "conflicting" is applied afterwards, in conflicts.js.
function assignStatus({ type, hasQuote, chunkFound, quoteFound, formality, supportsStatement }) {
  if (!hasQuote) return GAP_TYPES.includes(type) ? "missing" : null;
  if (!chunkFound || !quoteFound) return "uncertain";
  if (supportsStatement !== true) return "uncertain";
  if (formality !== "formal") return "uncertain";
  return "verified";
}

module.exports = { assignStatus, GAP_TYPES };