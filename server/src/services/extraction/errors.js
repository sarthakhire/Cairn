// What a person sees when an extraction run fails. Pure: the error classes are passed in, so this
// file needs neither the database nor the AI client. The text is written for someone clicking the
// button, never for a developer, and never repeats err.message (it can name keys or settings).

const MESSAGES = {
  noKey:
    "Extraction is switched off on this server because no AI key is set. Everything else works, and the claims already shown were extracted earlier.",
  busy: "The AI service is busy right now (the free plan has a request limit). Wait a minute and try again.",
  down: "The AI service could not be reached or did not give a usable answer. Wait a minute and try again.",
  running: "Extraction is already running. It can take several minutes. Try again when it has finished.",
  unexpected: "Extraction failed unexpectedly. Check the server log.",
};

// Returns { status, message, retryAfter? } for failures a person can understand and act on,
// or null for anything else (a real bug), which the caller lets become a 500.
function describeExtractionError(err, { LlmConfigError, LlmRateLimitError, ExtractionFailed }) {
  if (err instanceof ExtractionFailed) return { status: err.status, message: err.message };
  if (err instanceof LlmConfigError) return { status: 503, message: MESSAGES.noKey };
  if (err instanceof LlmRateLimitError) return { status: 503, message: MESSAGES.busy, retryAfter: 60 };
  // Any other error from the AI client (a network failure, a timeout, an unusable reply).
  const name = err && err.constructor && err.constructor.name;
  if (typeof name === "string" && name.startsWith("Llm")) return { status: 503, message: MESSAGES.down };
  return null;
}

module.exports = { describeExtractionError, MESSAGES };