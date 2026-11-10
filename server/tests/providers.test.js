const test = require("node:test");
const assert = require("node:assert");
const { createGeminiProvider, LlmConfigError, LlmRateLimitError } = require("../src/services/llm");

process.env.LLM_PROVIDER = "gemini";
process.env.LLM_MODEL = "test-model";

const reply = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
});
const okBody = { candidates: [{ content: { parts: [{ text: '{"a":' }, { text: "1}" }] } }] };

function setup(responses, minIntervalMs = 0) {
  const calls = [];
  const sleeps = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return responses.shift(); };
  const provider = createGeminiProvider({ fetchImpl, sleepFn: async (ms) => { sleeps.push(ms); }, minIntervalMs });
  return { provider, calls, sleeps };
}
const withKey = async (fn) => {
  const old = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "test-key";
  try { await fn(); } finally { if (old === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = old; }
};

test("gemini request is built correctly and the reply parts are joined", () => withKey(async () => {
  const { provider, calls } = setup([reply(200, okBody)]);
  const text = await provider({ system: "SYS", user: "USER" });
  assert.equal(text, '{"a":1}');
  const { url, init } = calls[0];
  assert.ok(url.includes("/models/test-model:generateContent"));
  assert.ok(!url.includes("test-key")); // the key goes in a header, never the URL
  assert.equal(init.headers["x-goog-api-key"], "test-key");
  const body = JSON.parse(init.body);
  assert.equal(body.systemInstruction.parts[0].text, "SYS");
  assert.equal(body.contents[0].parts[0].text, "USER");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.temperature, 0);
}));

test("a 429 is retried after the wait the server asks for", () => withKey(async () => {
  const { provider, calls, sleeps } = setup([reply(429, {}, { "retry-after": "7" }), reply(200, okBody)]);
  assert.equal(await provider({ system: "s", user: "u" }), '{"a":1}');
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [7000]);
}));

test("without retry-after the wait grows: 5s, 10s, 20s, then a rate-limit error", () => withKey(async () => {
  const { provider, calls, sleeps } = setup([reply(429), reply(429), reply(429), reply(503)]);
  await assert.rejects(() => provider({ system: "s", user: "u" }), LlmRateLimitError);
  assert.equal(calls.length, 4);
  assert.deepEqual(sleeps, [5000, 10000, 20000]);
}));

test("other errors fail at once and never include the response body", () => withKey(async () => {
  const { provider, calls } = setup([reply(400, { error: "SECRET SOURCE TEXT ECHO" })]);
  await assert.rejects(
    () => provider({ system: "s", user: "u" }),
    (err) => err.message === "LLM request failed with status 400" && !(err instanceof LlmRateLimitError)
  );
  assert.equal(calls.length, 1);
}));

test("a missing key is a config error, not a crash", async () => {
  const old = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    const { provider, calls } = setup([]);
    await assert.rejects(() => provider({ system: "s", user: "u" }), LlmConfigError);
    assert.equal(calls.length, 0);
  } finally { if (old !== undefined) process.env.LLM_API_KEY = old; }
});

test("real calls are spaced by the minimum interval", () => withKey(async () => {
  const { provider, sleeps } = setup([reply(200, okBody), reply(200, okBody)], 4000);
  await provider({ system: "s", user: "u" });
  await provider({ system: "s", user: "u" });
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] > 3000 && sleeps[0] <= 4000);
}));