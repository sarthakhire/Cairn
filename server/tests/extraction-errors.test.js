const test = require("node:test");
const assert = require("node:assert");
const { describeExtractionError, MESSAGES } = require("../src/services/extraction/errors");

class LlmConfigError extends Error {}
class LlmRateLimitError extends Error {}
class LlmNetworkError extends Error {} // a class the function has never been told about
class LlmOutputError extends Error {}
class ExtractionFailed extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}
const CLASSES = { LlmConfigError, LlmRateLimitError, ExtractionFailed };
const describe = (err) => describeExtractionError(err, CLASSES);

test("no AI key: a friendly 503 that never repeats the original message", () => {
  const out = describe(new LlmConfigError("LLM_API_KEY is not set (secret detail)"));
  assert.equal(out.status, 503);
  assert.equal(out.message, MESSAGES.noKey);
  assert.ok(!/LLM_API_KEY|secret/.test(out.message));
  assert.match(out.message, /no AI key/);
});

test("rate limit: a friendly 503 that says to wait, with a retry hint", () => {
  const out = describe(new LlmRateLimitError("429 from the provider, key abc123"));
  assert.equal(out.status, 503);
  assert.equal(out.message, MESSAGES.busy);
  assert.equal(out.retryAfter, 60);
  assert.ok(!out.message.includes("abc123"));
});

test("any other AI client error is a 503 too, whatever its class is called", () => {
  for (const err of [new LlmNetworkError("ECONNRESET to https://secret.host/key=1"), new LlmOutputError("bad json")]) {
    const out = describe(err);
    assert.equal(out.status, 503);
    assert.equal(out.message, MESSAGES.down);
    assert.ok(!out.message.includes("secret.host"));
  }
});

test("an extraction that failed on purpose keeps its own readable message and status", () => {
  assert.deepEqual(describe(new ExtractionFailed("No source chunks yet. Upload sources first.", 422)), {
    status: 422,
    message: "No source chunks yet. Upload sources first.",
  });
  assert.equal(describe(new ExtractionFailed("The AI model returned no usable output. Existing drafts were kept.")).status, 502);
});

test("a real bug is not described, so it stays a 500", () => {
  assert.equal(describe(new TypeError("x is undefined")), null);
  assert.equal(describe(new Error("boom")), null);
  assert.equal(describe(undefined), null);
  assert.equal(describe(null), null);
  assert.equal(describe("a string"), null);
});

test("every message is plain text with no setting names or stack-like text", () => {
  for (const [key, text] of Object.entries(MESSAGES)) {
    assert.ok(text.length > 20, key);
    assert.ok(!/LLM_|process\.env|at .*\(|\.js:\d+/.test(text), key);
  }
});