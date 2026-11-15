// Bad input through the real app, real JWT and real permission code. Every case must get a JSON
// error with a 4xx status, never a 500 and never an HTML page or a stack trace.
// Only the database models are replaced by small stand-ins.
process.env.JWT_SECRET = "test-secret-at-least-16-chars";

const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const Claim = require("../src/models/Claim");
const Handover = require("../src/models/Handover");
const Source = require("../src/models/Source");
const Chunk = require("../src/models/Chunk");
const AuditLog = require("../src/models/AuditLog");
const User = require("../src/models/User");
const app = require("../src/app");
const { signToken } = require("../src/middleware/auth");

const chain = (result) => {
  const c = { sort: () => c, populate: () => c, lean: () => c, select: () => c, limit: () => c,
    then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  return c;
};

const RAW_CLAIM = {
  claimId: "c_001", type: "decision", statement: "Team claim", status: "uncertain", visibility: "team",
  evidence: [], review: { state: "draft", reviewerId: null, at: null }, nextAction: null, conflictsWith: [], inference: false,
};

let created, inserted, audits;
function reset() {
  created = [];
  inserted = [];
  audits = [];
}
Claim.find = (filter) => chain(!filter || !filter.claimId || filter.claimId === "c_001" ? [structuredClone(RAW_CLAIM)] : []);
Handover.findById = () => chain(null);
User.findOne = () => chain(null);
Source.create = async (d) => { created.push(d); return { ...d, id: "s1", _id: "s1" }; };
Chunk.insertMany = async (rows) => { inserted = rows; };
AuditLog.create = async (d) => { audits.push(d); };

const BIG = 2 * 1024 * 1024;
const token = () => signToken({ _id: "u_lead", role: "lead", name: "Name lead" });
const as = (r) => r.set("Authorization", "Bearer " + token());

// A client error: 4xx, a JSON body with a readable message, and nothing that looks like an internal detail.
function assertClientError(res, label, allowed) {
  assert.ok(res.status >= 400 && res.status < 500, `${label}: got ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
  if (allowed) assert.ok(allowed.includes(res.status), `${label}: got ${res.status}, wanted one of ${allowed}`);
  assert.match(res.headers["content-type"] || "", /json/, label + ": not JSON");
  assert.equal(typeof res.body.error, "string", label);
  assert.ok(res.body.error.length > 0, label);
  assert.ok(!/node_modules|\.js:\d+|\bat .*\(|ReferenceError|TypeError/.test(res.body.error), label + ": leaks internals");
}

const upload = (filename, content, fields = { sensitivity: "team", formality: "formal" }, field = "file") => {
  let r = as(request(app).post("/api/sources"));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  if (content === null) return r;
  return r.attach(field, Buffer.isBuffer(content) ? content : Buffer.from(content), filename);
};

// ---- Request bodies --------------------------------------------------------------------------------
const BODY_ROUTES = [
  ["patch", "/api/claims/c_001"],
  ["post", "/api/claims/resolve"],
  ["post", "/api/claims/c_001/answer"],
];

test("a missing body, invalid JSON and JSON of the wrong kind are all 400s", async () => {
  reset();
  for (const [method, url] of BODY_ROUTES) {
    assertClientError(await as(request(app)[method](url)), `${method} ${url} with no body`, [400]);
    for (const raw of ['{"a":', "{", "not json", '{"a": undefined}']) {
      const res = await as(request(app)[method](url)).set("Content-Type", "application/json").send(raw);
      assertClientError(res, `${method} ${url} with ${raw}`, [400]);
      assert.equal(res.body.error, "Invalid JSON");
    }
    for (const raw of ["null", "[]", '"text"', "123", "true"]) {
      const res = await as(request(app)[method](url)).set("Content-Type", "application/json").send(raw);
      assertClientError(res, `${method} ${url} with ${raw}`, [400]);
    }
  }
});

test("wrong field names and wrong types are 400s", async () => {
  reset();
  const cases = [
    ["patch", "/api/claims/c_001", [{ act: "accept" }, { action: 5 }, { action: ["accept"] }, { action: "accept", override: {} }, { action: "edit", statement: 5 }, { action: "reject", reason: 12345 }]],
    ["post", "/api/claims/resolve", [{}, { keepId: 5, dropId: {} }, { keepId: "c_001" }, { keepId: "c_1", dropId: "x" }, { keep: "c_1", drop: "c_2" }]],
    ["post", "/api/claims/c_001/answer", [{}, { answer: 5 }, { answer: "" }, { answer: "   " }, { answer: ["a"] }, { text: "hello there" }]],
  ];
  for (const [method, url, bodies] of cases) {
    for (const body of bodies) {
      assertClientError(await as(request(app)[method](url)).send(body), `${method} ${url} with ${JSON.stringify(body)}`, [400]);
    }
  }
});

test("very long strings are refused, not stored or crashed on", async () => {
  reset();
  const long = (n) => "x".repeat(n);
  assertClientError(await as(request(app).patch("/api/claims/c_001")).send({ action: "edit", statement: long(1001) }), "statement 1001", [400]);
  assertClientError(await as(request(app).patch("/api/claims/c_001")).send({ action: "reject", reason: long(501) }), "reason 501", [400]);
  assertClientError(await as(request(app).patch("/api/claims/c_001")).send({ action: "accept", override: long(501) }), "override 501", [400]);
  assertClientError(await as(request(app).post("/api/claims/c_001/answer")).send({ answer: long(2001) }), "answer 2001", [400]);
  assertClientError(await as(request(app).post("/api/claims/resolve")).send({ keepId: "c_" + "9".repeat(5000), dropId: "c_2" }), "huge id", [400, 404, 409]);
});

test("a body over 2 MB is a 413 and an unsupported charset or encoding is a 415", async () => {
  reset();
  const huge = JSON.stringify({ x: "a".repeat(BIG + 100) });
  assertClientError(await as(request(app).post("/api/claims/resolve")).set("Content-Type", "application/json").send(huge), "3 MB body", [413]);
  assertClientError(
    await as(request(app).post("/api/claims/resolve")).set("Content-Type", "application/json; charset=iso-8859-1").send("{}"),
    "charset iso-8859-1", [415]
  );
  assertClientError(
    await as(request(app).post("/api/claims/resolve")).set("Content-Type", "application/json").set("Content-Encoding", "zz").send("{}"),
    "unknown content encoding", [415]
  );
});

test("login: missing body, wrong types and huge strings are 400 or 401, never a 500", async () => {
  reset();
  const bodies = [undefined, [], "text", { email: 5, password: "x" }, { email: "a@b.co" }, { password: "x" },
    { email: "a@b.co", password: "x".repeat(100000) }, { email: "x".repeat(100000), password: "y" },
    { email: { $gt: "" }, password: { $gt: "" } }];
  for (const body of bodies) {
    let r = request(app).post("/api/auth/login");
    if (body !== undefined) r = r.set("Content-Type", "application/json").send(JSON.stringify(body));
    assertClientError(await r, "login with " + String(JSON.stringify(body)).slice(0, 60), [400, 401]);
  }
});

// ---- Ids, URLs, query strings, unknown routes ------------------------------------------------------
test("bad claim ids are 404s on every claim route", async () => {
  reset();
  const ids = ["c_", "c_abc", "C_001", "c_001x", "1", "c_-1", "c_1.5",
    encodeURIComponent("c_1 or 1=1"), encodeURIComponent("../etc/passwd"), "%00", "%2F", "c_1%2Fx"];
  for (const id of ids) {
    assertClientError(await as(request(app).get("/api/claims/" + id)), "GET " + id.slice(0, 30), [404]);
    assertClientError(await as(request(app).patch("/api/claims/" + id)).send({ action: "accept" }), "PATCH " + id.slice(0, 30), [404]);
    assertClientError(await as(request(app).post("/api/claims/" + id + "/answer")).send({ answer: "an answer" }), "answer " + id.slice(0, 30), [404]);
  }
});

test("a malformed URL escape is a client error, not a 500", async () => {
  reset();
  for (const path of ["/api/claims/%E0%A4%A", "/api/claims/%", "/api/claims/%zz"]) {
    assertClientError(await as(request(app).get(path)), path, [400, 404]);
  }
});

test("bad query strings on the claim list are refused or ignored, never a 500", async () => {
  reset();
  for (const q of ["nope=1", "sort=bogus", "type=bogus", "as=x", "as=", "limit=-1", "q=" + "a".repeat(2000), "type[]=a&type[]=b", "type[$ne]=x"]) {
    const res = await as(request(app).get("/api/claims?" + q));
    assert.ok(res.status < 500, q + " gave " + res.status);
    assert.match(res.headers["content-type"] || "", /json/, q);
    if (res.status >= 400) assert.equal(typeof res.body.error, "string", q);
  }
});

test("unknown routes and methods get a JSON 404, inside /api or not", async () => {
  reset();
  for (const [method, url] of [["get", "/nope"], ["get", "/"], ["get", "/api/nope"], ["put", "/api/claims/c_001"], ["delete", "/api/claims/c_001"], ["post", "/api/health"]]) {
    const res = await as(request(app)[method](url));
    assertClientError(res, method + " " + url, [404]);
  }
});

test("a bad or missing token is a JSON 401", async () => {
  reset();
  for (const header of [undefined, "Bearer ", "Bearer junk", "Basic abc", "Bearer " + "a".repeat(5000)]) {
    let r = request(app).get("/api/claims");
    if (header !== undefined) r = r.set("Authorization", header);
    assertClientError(await r, "token " + String(header).slice(0, 20), [401]);
  }
});

// ---- Uploads ----------------------------------------------------------------------------------------
test("upload with no file, the wrong field name or no form at all is a 400", async () => {
  reset();
  assertClientError(await upload(null, null), "no file", [400]);
  assertClientError(await upload("notes.md", "# A\ntext here", undefined, "upload"), "wrong field name", [400]);
  assertClientError(await as(request(app).post("/api/sources")), "no body at all", [400]);
  assertClientError(await as(request(app).post("/api/sources")).send({ sensitivity: "team" }), "JSON instead of a form", [400]);
  assert.equal(inserted.length, 0);
});

test("upload with bad or repeated form fields is a 400", async () => {
  reset();
  const md = "# A\nsome readable text for the club";
  assertClientError(await upload("a.md", md, {}), "no sensitivity", [400]);
  assertClientError(await upload("a.md", md, { sensitivity: "secret" }), "bad sensitivity", [400]);
  assertClientError(await upload("a.md", md, { sensitivity: "team", formality: "maybe" }), "bad formality", [400]);
  assertClientError(
    await as(request(app).post("/api/sources")).field("sensitivity", "team").field("sensitivity", "restricted").attach("file", Buffer.from(md), "a.md"),
    "sensitivity twice", [400]
  );
  assertClientError(await upload("a.md", md, { sensitivity: "x".repeat(2 * 1024 * 1024) }), "huge field value", [400, 413]);
  assert.equal(created.length, 0);
});

test("a wrong extension is a 415, a too-long name is a 400", async () => {
  reset();
  for (const name of ["notes.txt", "notes", "notes.exe", "notes.md.exe", "notes.pdf"]) {
    assertClientError(await upload(name, "# A\ntext here for the club"), name, [415]);
  }
  assertClientError(await upload("a".repeat(300) + ".md", "# A\ntext here for the club"), "300 character name", [400]);
  assert.equal(created.length, 0);
});

test("upper-case extensions are accepted", async () => {
  reset();
  const res = await upload("NOTES.MD", "# A\nsome readable text for the club");
  assert.equal(res.status, 201, JSON.stringify(res.body));
});

test("empty, blank and unreadable files are 4xx, never a 500", async () => {
  reset();
  const files = [
    ["empty.md", ""], ["empty.json", ""], ["empty.csv", ""],
    ["blank.md", "  \n\n \t "], ["blank.json", "  \n "], ["blank.csv", "\n\n"],
    ["bad.json", '{"issues": ['], ["bad.json", '{"foo": 1}'], ["bad.json", "[]"], ["bad.json", "null"], ["bad.json", "123"], ["bad.json", '"text"'],
    ["bad.csv", 'Task,Owner\n"unclosed,quote'], ["bad.csv", "Owner,Status\nA,B"], ["bad.csv", "Task,Owner"], ["bad.csv", "\u0000\u0001\u0002"],
  ];
  for (const [name, content] of files) {
    assertClientError(await upload(name, content), `${name} with ${JSON.stringify(content).slice(0, 30)}`, [400, 422]);
  }
  assert.equal(created.length, 0);
});

test("binary garbage under any supported extension never causes a 500", async () => {
  reset();
  const junk = Buffer.from([0, 159, 146, 150, 255, 254, 0, 1, 2, 3, 200, 201]);
  for (const name of ["junk.md", "junk.json", "junk.csv"]) {
    const res = await upload(name, junk);
    assert.ok(res.status < 500, `${name} gave ${res.status}`);
    assert.match(res.headers["content-type"] || "", /json/);
  }
});

test("2 MB plus one byte is a 413 and exactly 2 MB is not", async () => {
  reset();
  assertClientError(await upload("big.md", Buffer.alloc(BIG + 1, "a")), "2 MB + 1", [413]);
  const edge = await upload("edge.md", Buffer.alloc(BIG, "a"));
  assert.notEqual(edge.status, 413);
  assert.ok(edge.status < 500, "exactly 2 MB gave " + edge.status);
});

test("a duplicate source name is a 409", async () => {
  reset();
  const original = Source.create;
  Source.create = async () => {
    throw Object.assign(new Error("duplicate"), { code: 11000 });
  };
  try {
    assertClientError(await upload("again.md", "# A\nsome readable text for the club"), "duplicate", [409]);
  } finally {
    Source.create = original;
  }
});