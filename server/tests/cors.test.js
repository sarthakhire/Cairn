// With CORS_ORIGIN set, only the listed sites may call the API from a browser.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";
process.env.CORS_ORIGIN = "https://cairn-handovertrail.netlify.app/, https://other.example";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/app");

const header = (res) => res.headers["access-control-allow-origin"];

test("a listed site is allowed, even when the setting has a trailing slash or spaces", async () => {
  for (const origin of ["https://cairn-handovertrail.netlify.app", "https://other.example"]) {
    const res = await request(app).get("/api/health").set("Origin", origin);
    assert.equal(res.status, 200);
    assert.equal(header(res), origin);
  }
});

test("any other site gets no permission header, so the browser blocks it", async () => {
  for (const origin of ["https://evil.example", "http://localhost:5173", "https://cairn-handovertrail.netlify.app.evil.example"]) {
    const res = await request(app).get("/api/health").set("Origin", origin);
    assert.equal(header(res), undefined);
  }
});

test("the browser's preflight for an authorised call is answered for a listed site only", async () => {
  const ok = await request(app).options("/api/claims").set("Origin", "https://other.example")
    .set("Access-Control-Request-Method", "PATCH").set("Access-Control-Request-Headers", "authorization,content-type");
  assert.equal(header(ok), "https://other.example");
  const bad = await request(app).options("/api/claims").set("Origin", "https://evil.example")
    .set("Access-Control-Request-Method", "PATCH");
  assert.equal(header(bad), undefined);
});
