process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");

// Patch before the app loads, because the route reads runExtraction at require time.
const pipeline = require("../src/services/extraction/pipeline");
const { LlmConfigError, LlmRateLimitError } = require("../src/services/llm");
let behaviour = async () => ({ claimsCreated: 3 });
pipeline.runExtraction = (args) => behaviour(args);

const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

const post = (role) => {
  const req = request(app).post("/api/extract");
  return role ? req.set("Authorization", "Bearer " + signToken({ _id: "u1", role, name: role })) : req;
};

test("only the reviewer may run extraction", async () => {
  assert.equal((await post()).status, 401);
  assert.equal((await post("incoming_developer")).status, 403);
  assert.equal((await post("incoming_lead")).status, 403);
  const res = await post("lead");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { claimsCreated: 3 });
});

test("known failures map to clean JSON errors", async () => {
  behaviour = async () => { throw new pipeline.ExtractionFailed("No source chunks yet. Upload sources first.", 422); };
  let res = await post("lead");
  assert.equal(res.status, 422);
  assert.deepEqual(res.body, { error: "No source chunks yet. Upload sources first." });

  behaviour = async () => { throw new LlmConfigError("LLM_API_KEY is not set"); };
  res = await post("lead");
  assert.equal(res.status, 503);

  behaviour = async () => { throw new LlmRateLimitError("The AI model is rate limited or busy."); };
  res = await post("lead");
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { error: "The AI model is rate limited or busy." });

  behaviour = async () => { throw new Error("secret internal detail"); };
  res = await post("lead");
  assert.equal(res.status, 500);
  assert.ok(!JSON.stringify(res.body).includes("secret internal detail"));
});

test("a second run while one is in progress gets 409, and the lock is released afterwards", async () => {
  let release;
  behaviour = () => new Promise((r) => (release = () => r({ claimsCreated: 1 })));
  const first = post("lead").then((r) => r);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await post("lead")).status, 409);
  release();
  assert.equal((await first).status, 200);
  behaviour = async () => ({ claimsCreated: 2 });
  assert.equal((await post("lead")).status, 200);
});