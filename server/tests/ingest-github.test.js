const test = require("node:test");
const assert = require("node:assert");
const { parseGithub } = require("../src/services/ingest/github");
const { IngestError } = require("../src/services/ingest/util");

const J = (o) => JSON.stringify(o);

test("an issue becomes one chunk with title, author, body and comments", () => {
  const chunks = parseGithub(
    J({
      issues: [
        {
          number: 9,
          title: "Hosting plan",
          body: "free tier ends 30 March",
          state: "open",
          user: { login: "riya" },
          created_at: "2026-02-25T10:12:00Z",
          html_url: "https://github.com/x/y/issues/9",
          comments: [{ user: { login: "karan" }, body: "ok, noted", created_at: "2026-02-26T08:00:00Z" }],
        },
      ],
    }),
    "issues.json"
  );
  assert.equal(chunks.length, 1);
  const c = chunks[0];
  assert.equal(c.ref, "issues.json#1");
  assert.equal(c.author, "riya");
  assert.equal(c.link, "https://github.com/x/y/issues/9");
  assert.match(c.text, /^Issue #9: Hosting plan\nAuthor: riya \| State: open \| Created: 2026-02-25/);
  assert.match(c.text, /free tier ends 30 March/);
  assert.match(c.text, /Comment by karan \(2026-02-26\): ok, noted/);
});

test("the chunk date is the latest activity on the issue", () => {
  const [c] = parseGithub(
    J({
      issues: [
        {
          number: 1,
          title: "t",
          body: "b",
          created_at: "2026-02-01T00:00:00Z",
          comments: [{ body: "later", created_at: "2026-02-10T00:00:00Z" }],
        },
      ],
    }),
    "i.json"
  );
  assert.equal(c.timestamp.toISOString().slice(0, 10), "2026-02-10");
});

test("both commit shapes are read", () => {
  const chunks = parseGithub(
    J({
      commits: [
        { sha: "3f9a1c2d8e5b4a7c", message: "Pin hosting", author: "riya", date: "2026-02-12T16:20:00Z" },
        { sha: "a81b2c3d4e5f6071", commit: { message: "Add views", author: { name: "aman", date: "2026-02-26T19:45:00Z" } } },
      ],
    }),
    "c.json"
  );
  assert.equal(chunks.length, 2);
  assert.match(chunks[0].text, /^Commit 3f9a1c2: Pin hosting\nAuthor: riya \| Date: 2026-02-12/);
  assert.equal(chunks[1].author, "aman");
  assert.equal(chunks[1].timestamp.toISOString().slice(0, 10), "2026-02-26");
});

test("issues come first, then commits, numbered continuously", () => {
  const chunks = parseGithub(
    J({ issues: [{ number: 1, title: "a", body: "x" }, { number: 2, title: "b", body: "y" }], commits: [{ message: "fix it" }] }),
    "f.json"
  );
  assert.deepEqual(chunks.map((c) => c.ref), ["f.json#1", "f.json#2", "f.json#3"]);
  assert.match(chunks[2].text, /^Commit: fix it/);
});

test("a numeric comments field and a null body do not break anything", () => {
  const [c] = parseGithub(J({ issues: [{ number: 5, title: "No body", body: null, comments: 3 }] }), "i.json");
  assert.match(c.text, /^Issue #5: No body/);
  assert.equal(c.timestamp, null);
});

test("empty issues and commits are skipped", () => {
  const chunks = parseGithub(
    J({ issues: [{ number: 1 }, { number: 2, title: "real", body: "x" }], commits: [{ sha: "abc" }, { message: "  " }] }),
    "i.json"
  );
  assert.equal(chunks.length, 1);
});

test("only http(s) links are kept", () => {
  const [c] = parseGithub(J({ issues: [{ number: 1, title: "t", html_url: "javascript:alert(1)" }] }), "i.json");
  assert.equal(c.link, null);
});

test("bad input throws IngestError with a clear message", () => {
  assert.throws(() => parseGithub("{nope", "i.json"), (e) => e instanceof IngestError && /not valid JSON/.test(e.message));
  assert.throws(() => parseGithub("[]", "i.json"), IngestError);
  assert.throws(() => parseGithub("null", "i.json"), IngestError);
  assert.throws(() => parseGithub("{}", "i.json"), (e) => e instanceof IngestError && /issues/.test(e.message));
});