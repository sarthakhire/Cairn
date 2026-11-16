process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");

// readyState is a getter on the connection; an own property shadows it for the test.
const setState = (n) => Object.defineProperty(mongoose.connection, "readyState", { value: n, configurable: true });
const clearState = () => {
  delete mongoose.connection.readyState;
};

test("health reports the database as up, connecting or down, and the server itself as ok", async () => {
  try {
    for (const [state, want] of [[1, "up"], [2, "connecting"], [0, "down"], [3, "down"], [99, "down"]]) {
      setState(state);
      const res = await request(app).get("/api/health");
      assert.equal(res.status, 200, "state " + state);
      assert.deepEqual(res.body, { ok: true, db: want }, "state " + state);
    }
  } finally {
    clearState();
  }
});

test("health needs no token, ignores a bad one, is never cached and carries nothing else", async () => {
  setState(0);
  try {
    const plain = await request(app).get("/api/health");
    const junk = await request(app).get("/api/health").set("Authorization", "Bearer not-a-token");
    for (const res of [plain, junk]) {
      assert.equal(res.status, 200);
      assert.match(res.headers["cache-control"], /no-store/);
      assert.deepEqual(Object.keys(res.body).sort(), ["db", "ok"]);
    }
  } finally {
    clearState();
  }
});

test("health answers quickly with the database down and never queries it", async () => {
  setState(0); // any query on a disconnected connection would wait, so a fast answer means none was made
  try {
    const t0 = Date.now();
    const res = await request(app).get("/api/health");
    assert.equal(res.body.db, "down");
    assert.ok(Date.now() - t0 < 500);
  } finally {
    clearState();
  }
});

// ---- The database is unreachable ----
const Claim = require("../src/models/Claim");
const { signToken } = require("../src/middleware/auth");
const leadHeader = () => ({ Authorization: "Bearer " + signToken({ _id: "u_lead", role: "lead", name: "Name lead" }) });
const emptyChain = () => {
  const c = { sort: () => c, populate: () => c, lean: () => c, select: () => c, limit: () => c, then: (ok, bad) => Promise.resolve([]).then(ok, bad) };
  return c;
};

test("guard on and database down: API calls get an immediate 503, health still answers, and a connected database passes through", async () => {
  Claim.find = () => emptyChain();
  app.set("requireDb", true);
  try {
    setState(0);
    const t0 = Date.now();
    const down = await request(app).get("/api/claims").set(leadHeader());
    assert.equal(down.status, 503);
    assert.match(down.body.error, /database is not reachable/);
    assert.ok(Date.now() - t0 < 500, "must not wait for a timeout");
    assert.equal((await request(app).get("/api/health")).status, 200);
    assert.equal((await request(app).post("/api/auth/login").send({ email: "a@b.co", password: "x" })).status, 503);

    setState(2); // still connecting counts as not ready
    assert.equal((await request(app).get("/api/claims").set(leadHeader())).status, 503);

    setState(1);
    const up = await request(app).get("/api/claims").set(leadHeader());
    assert.equal(up.status, 200);
    assert.deepEqual(up.body, []);
  } finally {
    app.set("requireDb", false);
    clearState();
  }
});

test("guard off (the default, as in tests): nothing is blocked while the connection state is down", async () => {
  Claim.find = () => emptyChain();
  setState(0);
  try {
    assert.equal((await request(app).get("/api/claims").set(leadHeader())).status, 200);
  } finally {
    clearState();
  }
});

test("a database error in the middle of a request is a 503, any other error is still a 500", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const failWith = (err) => {
      Claim.find = () => {
        throw err;
      };
    };
    for (const err of [
      Object.assign(new Error("Server selection timed out"), { name: "MongooseServerSelectionError" }),
      Object.assign(new Error("connection closed"), { name: "MongoNetworkError" }),
      Object.assign(new Error("Operation `claims.find()` buffering timed out after 10000ms"), { name: "MongooseError" }),
    ]) {
      failWith(err);
      const res = await request(app).get("/api/claims").set(leadHeader());
      assert.equal(res.status, 503, err.name);
      assert.match(res.body.error, /database is not reachable/);
      assert.ok(!JSON.stringify(res.body).includes("buffering"));
    }
    failWith(new TypeError("a real bug"));
    const bug = await request(app).get("/api/claims").set(leadHeader());
    assert.equal(bug.status, 500);
    assert.deepEqual(bug.body, { error: "Server error" });
  } finally {
    console.error = quiet;
  }
});