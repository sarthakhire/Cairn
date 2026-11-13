const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

// The only file that knows which AI provider is used. Pick one with
// LLM_PROVIDER in .env: "gemini" (default, has a free tier) or "anthropic".
// To add another provider, write one more function like geminiProvider below.

class LlmConfigError extends Error {}
class LlmOutputError extends Error {}
class LlmRateLimitError extends Error {}
// A dropped connection or a timeout that kept happening. Extends LlmRateLimitError so the
// extract route already answers it with a clear 503.
class LlmNetworkError extends LlmRateLimitError {}

const DEFAULT_CACHE_DIR = path.join(__dirname, "..", "..", ".cache", "llm"); // git-ignored
const DEFAULT_MODELS = { gemini: "gemini-flash-latest", anthropic: "claude-sonnet-5-5" };

const providerName = () => (process.env.LLM_PROVIDER || "gemini").toLowerCase();
const modelName = () => process.env.LLM_MODEL || DEFAULT_MODELS[providerName()];
const timeoutMs = () => Number(process.env.LLM_TIMEOUT_MS) || 90_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits so that real calls are at least minIntervalMs apart (free tiers limit calls per minute).
// Cached answers never reach the provider, so they are never slowed down.
function makePacer(minIntervalMs, sleepFn) {
  let last = 0;
  return async () => {
    const wait = last + minIntervalMs - Date.now();
    if (wait > 0) await sleepFn(wait);
    last = Date.now();
  };
}

// 429 (rate limited) and 503 (busy) are retried with a wait; everything else fails at once.
// Only the status is reported, because a response body could echo source text.
async function postWithRetry({ url, makeInit, fetchImpl, sleepFn, pace, retries = 3 }) {
  for (let attempt = 0; ; attempt++) {
    await pace();
    let res;
    try {
      res = await fetchImpl(url, makeInit());
    } catch (err) {
      // A reset connection or a timeout is retried like a busy server. Anything else is a real bug.
      // The error text is not kept, because it can name the host.
      const network = err && (err.name === "TimeoutError" || err.name === "AbortError" || (err instanceof TypeError && err.message === "fetch failed"));
      if (!network) throw err;
      if (attempt >= retries) {
        throw new LlmNetworkError(
          "Could not reach the AI service: the connection was reset or timed out. Check your network, then run again; finished steps are cached."
        );
      }
      await sleepFn(Math.min(5000 * 2 ** attempt, 60_000));
      continue;
    }
    if (res.ok) return res;
    if (res.status !== 429 && res.status !== 503) {
      throw new Error("LLM request failed with status " + res.status);
    }
    if (attempt >= retries) {
      throw new LlmRateLimitError(
        "The AI model is rate limited or busy. Wait a few minutes and run again; finished steps are cached."
      );
    }
    const asked = Number(res.headers && res.headers.get && res.headers.get("retry-after"));
    const wait = asked > 0 ? asked * 1000 : 5000 * 2 ** attempt; // 5s, 10s, 20s
    await sleepFn(Math.min(wait, 60_000));
  }
}

function createGeminiProvider({
  fetchImpl = fetch,
  sleepFn = sleep,
  minIntervalMs = Number(process.env.LLM_MIN_INTERVAL_MS) || 4000,
} = {}) {
  const pace = makePacer(minIntervalMs, sleepFn);
  return async function geminiProvider({ system, user }) {
    const key = process.env.LLM_API_KEY;
    if (!key) throw new LlmConfigError("LLM_API_KEY is not set");

    const res = await postWithRetry({
      url: "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelName()) + ":generateContent",
      makeInit: () => ({
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(timeoutMs()),
      }),
      fetchImpl,
      sleepFn,
      pace,
    });
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.map((p) => p.text || "").join("");
  };
}

function createAnthropicProvider({ fetchImpl = fetch, sleepFn = sleep, minIntervalMs = 0 } = {}) {
  const pace = makePacer(minIntervalMs, sleepFn);
  return async function anthropicProvider({ system, user }) {
    const key = process.env.LLM_API_KEY;
    if (!key) throw new LlmConfigError("LLM_API_KEY is not set");

    const res = await postWithRetry({
      url: "https://api.anthropic.com/v1/messages",
      makeInit: () => ({
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: modelName(),
          max_tokens: 4096,
          temperature: 0,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(timeoutMs()),
      }),
      fetchImpl,
      sleepFn,
      pace,
    });
    const data = await res.json();
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  };
}

const providers = { gemini: createGeminiProvider(), anthropic: createAnthropicProvider() };

function defaultProvider(args) {
  const p = providers[providerName()];
  if (!p) throw new LlmConfigError('LLM_PROVIDER must be "gemini" or "anthropic"');
  return p(args);
}

// Models sometimes wrap JSON in code fences or add a sentence around it.
function parseJsonLoose(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a !== -1 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new SyntaxError("No JSON object in model output");
  }
}

// generateJson({ system, user, schema? }) -> validated object.
// Results are cached by a hash of (model, system, user), so retries and demo
// reruns cost nothing. Only output that passed validation is ever cached.
function createGenerator({
  provider = defaultProvider,
  cacheDir = DEFAULT_CACHE_DIR,
  modelId = () => providerName() + ":" + modelName(),
} = {}) {
  return async function generateJson({ system, user, schema }) {
    const key = crypto.createHash("sha256").update(JSON.stringify([modelId(), system, user])).digest("hex");
    const file = path.join(cacheDir, key + ".json");
    const validate = (v) => (schema ? schema.safeParse(v) : { success: true, data: v });

    try {
      const hit = validate(JSON.parse(await fs.readFile(file, "utf8")));
      if (hit.success) return hit.data;
    } catch {
      // cache miss or unreadable file: fall through to the provider
    }

    let problem = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0 ? user : user + "\n\nYour previous reply could not be used. Reply with the JSON object only.";
      const text = await provider({ system, user: prompt });

      let parsed;
      try {
        parsed = parseJsonLoose(text);
      } catch {
        problem = "was not valid JSON";
        continue;
      }
      const result = validate(parsed);
      if (result.success) {
        await fs.mkdir(cacheDir, { recursive: true }).then(() => fs.writeFile(file, JSON.stringify(parsed))).catch(() => {});
        return result.data;
      }
      problem = "did not match the expected shape";
    }
    throw new LlmOutputError("Model output " + problem + " after 2 attempts");
  };
}

module.exports = {
  generateJson: createGenerator(),
  createGenerator,
  parseJsonLoose,
  createGeminiProvider,
  createAnthropicProvider,
  LlmConfigError,
  LlmOutputError,
  LlmRateLimitError,
  LlmNetworkError,
};