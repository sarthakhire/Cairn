// POST/GET /api/extract through the real app. The extraction itself is replaced by a stand-in,
// so these tests are about what the route does with its outcome.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const pipeline = require("../src/services/extraction/pipeline");
const { LlmConfigError, LlmRateLimitError } = require("../src/services/llm");
const AuditLog = require("../src/models/AuditLog");
const app = require("../src/app");
const extractRoute = require("../src/routes/extract");
const { signToken } = require("../src/middleware/auth");

AuditLog.create = async () => {}; // refusals are logged; keep that away from the database

const tokenFor = (role) => signToken({ _id: "u_" + role, role, name: "Name " + role });
const call = (method, path, role) => {
  const r = request(app)[method](path);
  return role ? r.set("Authorization", "Bearer " + tokenFor(role)) : r;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function waitFor(check, label) {
  for (let i = 0; i < 100; i++) {
    const v = await check();
    if (v) return v;
    await sleep(10);
  }
  throw new Error("timed out waiting for " + label);
}
class LlmNetworkError extends Error {}

let calls;
function reset(impl) {
  extractRoute.reset();
  calls = 0;
  pipeline.runExtraction = async (args) => {
    calls += 1;
    return impl ? impl(args) : { claimsCreated: 3 };
  };
}

test("the default request still waits and returns the summary", async () => {
  reset();
  const res = await call("post", "/api/extract", "lead");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { claimsCreated: 3 });
});

test("no AI key: a friendly 503 that leaves out the original message", async () => {
  reset(() => {
    throw new LlmConfigError("LLM_API_KEY is not set (secret detail)");
  });
  const res = await call("post", "/api/extract", "lead");
  assert.equal(res.status, 503);
  assert.match(res.body.error, /no AI key/);
  assert.ok(!/LLM_API_KEY|secret/.test(res.body.error));
  assert.deepEqual(Object.keys(res.body), ["error"]);
});

test("rate limit: a friendly 503 with a Retry-After header", async () => {
  reset(() => {
    throw new LlmRateLimitError("429 from the provider");
  });
  const res = await call("post", "/api/extract", "lead");
  assert.equal(res.status, 503);
  assert.equal(res.headers["retry-after"], "60");
  assert.match(res.body.error, /busy/);
});

test("any other AI client error is a friendly 503", async () => {
  reset(() => {
    throw new LlmNetworkError("ECONNRESET https://secret.host/?key=1");
  });
  const res = await call("post", "/api/extract", "lead");
  assert.equal(res.status, 503);
  assert.ok(!res.body.error.includes("secret.host"));
});

test("a failure that was planned keeps its own status and text", async () => {
  reset(() => {
    throw new pipeline.ExtractionFailed("No source chunks yet. Upload sources first.", 422);
  });
  const res = await call("post", "/api/extract", "lead");
  assert.equal(res.status, 422);
  assert.equal(res.body.error, "No source chunks yet. Upload sources first.");
});

test("a real bug is a plain 500 and leaks nothing, and the lock is released", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    reset(() => {
      throw new TypeError("x is undefined at /secret/path.js:1");
    });
    const res = await call("post", "/api/extract", "lead");
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: "Server error" });
    const status = await call("get", "/api/extract", "lead");
    assert.equal(status.body.state, "failed");
    assert.ok(!JSON.stringify(status.body).includes("secret"));
    pipeline.runExtraction = async () => ({ claimsCreated: 1 });
    assert.equal((await call("post", "/api/extract", "lead")).status, 200); // not stuck on "running"
  } finally {
    console.error = quiet;
  }
});

test("a second request while one is running is a 409 with a readable text, and the lock is released afterwards", async () => {
  const d = deferred();
  reset(() => d.promise);
  const first = call("post", "/api/extract", "lead").then((r) => r);
  await waitFor(async () => (await call("get", "/api/extract", "lead")).body.state === "running", "the run to start");

  const second = await call("post", "/api/extract", "lead");
  assert.equal(second.status, 409);
  assert.match(second.body.error, /already running/);
  assert.match(second.body.error, /several minutes/);
  assert.equal(calls, 1);

  d.resolve({ claimsCreated: 7 });
  assert.equal((await first).status, 200);
  pipeline.runExtraction = async () => ({ claimsCreated: 1 });
  assert.equal((await call("post", "/api/extract", "lead")).status, 200);
});

test("nothing has run yet: the status is idle", async () => {
  reset();
  const res = await call("get", "/api/extract", "lead");
  assert.deepEqual(res.body, { state: "idle", startedAt: null, finishedAt: null, seconds: null, summary: null, error: null });
});

test("background run: 202 at once, status running, then done with the summary", async () => {
  const d = deferred();
  reset(() => d.promise);
  const started = await call("post", "/api/extract?background=1", "lead");
  assert.equal(started.status, 202);
  assert.equal(started.body.state, "running");
  assert.equal(typeof started.body.startedAt, "string");

  const running = await call("get", "/api/extract", "lead");
  assert.equal(running.body.state, "running");
  assert.equal(typeof running.body.seconds, "number");
  assert.equal(running.body.finishedAt, null);

  assert.equal((await call("post", "/api/extract?background=1", "lead")).status, 409);
  assert.equal((await call("post", "/api/extract", "lead")).status, 409);
  assert.equal(calls, 1);

  d.resolve({ claimsCreated: 3, verified: 2 });
  const done = await waitFor(async () => {
    const b = (await call("get", "/api/extract", "lead")).body;
    return b.state === "done" ? b : null;
  }, "the run to finish");
  assert.deepEqual(done.summary, { claimsCreated: 3, verified: 2 });
  assert.equal(done.error, null);
  assert.equal(typeof done.finishedAt, "string");
});

test("background run that fails: the status carries the friendly text and nothing is left unhandled", async () => {
  const d = deferred();
  reset(() => d.promise);
  assert.equal((await call("post", "/api/extract?background=1", "lead")).status, 202);
  d.reject(new LlmConfigError("LLM_API_KEY is not set (secret detail)"));
  const failed = await waitFor(async () => {
    const b = (await call("get", "/api/extract", "lead")).body;
    return b.state === "failed" ? b : null;
  }, "the run to fail");
  assert.match(failed.error, /no AI key/);
  assert.ok(!/LLM_API_KEY|secret/.test(failed.error));
  assert.equal(failed.summary, null);
  // and a new run can start
  pipeline.runExtraction = async () => ({ claimsCreated: 1 });
  assert.equal((await call("post", "/api/extract?background=1", "lead")).status, 202);
});

test("only the reviewer can start or read a run, and nothing runs for anyone else", async () => {
  reset();
  for (const role of ["incoming_lead", "incoming_developer"]) {
    assert.equal((await call("post", "/api/extract", role)).status, 403);
    assert.equal((await call("post", "/api/extract?background=1", role)).status, 403);
    assert.equal((await call("get", "/api/extract", role)).status, 403);
  }
  assert.equal((await call("post", "/api/extract")).status, 401);
  assert.equal((await call("get", "/api/extract")).status, 401);
  assert.equal(calls, 0);
});