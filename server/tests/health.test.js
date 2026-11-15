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