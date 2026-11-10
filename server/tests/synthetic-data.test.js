const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { parseSource } = require("../src/services/ingest");
const { verifyQuote } = require("../src/services/verify");
const mock = require("../../client/src/mock/claims.json");

const DATA = path.join(__dirname, "..", "..", "data");
const load = (name) => parseSource(name, fs.readFileSync(path.join(DATA, name), "utf8"));

// The synthetic project must back the evidence in the frontend mock, so the demo
// the backend produces tells the same story. tasks.csv is checked separately because
// the mock quotes a paraphrase of the row, not the "Task: ... | Owner: ..." text.
test("every mock quote (except tasks.csv) is found in a chunk of its source, with the same date", () => {
  const seen = new Set();
  for (const claim of mock) {
    for (const ev of claim.evidence) {
      if (ev.source === "tasks.csv") continue;
      const { chunks } = load(ev.source);
      const hit = chunks.find((c) => verifyQuote(ev.quote, c.text));
      assert.ok(hit, claim.id + ": quote not found in " + ev.source + ": " + ev.quote);
      assert.equal(hit.timestamp.toISOString().slice(0, 10), ev.date, claim.id + " date");
      seen.add(ev.source);
    }
  }
  assert.ok(seen.size >= 5);
});

test("every data file parses into at least one chunk", () => {
  for (const f of fs.readdirSync(DATA).filter((n) => !n.startsWith("."))) {
    assert.ok(load(f).chunks.length > 0, f);
  }
});

test("chunk numbers are unique and sequential in every file", () => {
  for (const f of fs.readdirSync(DATA).filter((n) => !n.startsWith("."))) {
    const { chunks } = load(f);
    assert.deepEqual(chunks.map((c) => c.n), chunks.map((_, i) => i + 1), f);
  }
});

test("the restricted file holds only obviously fake credentials", () => {
  const text = fs.readFileSync(path.join(DATA, "restricted-credentials.md"), "utf8");
  assert.match(text, /FAKE_KEY_abc123/);
  assert.match(text, /FAKE_PASSWORD/);
  assert.doesNotMatch(text, /AKIA|ghp_|sk-[A-Za-z0-9]{10}/);
});

test("planted items are present: conflict, stale task, missing owner, hidden dependency, lead-only talk", () => {
  const n3 = load("meeting-notes-03.md").chunks.map((c) => c.text).join("\n");
  const chat = load("chat-export.md").chunks.map((c) => c.text).join("\n");
  assert.match(n3, /going with Postgres/); // conflict, side 1
  assert.match(chat, /use Mongo/); // conflict, side 2
  const tasks = load("tasks.csv").chunks.map((c) => c.text);
  assert.ok(tasks.some((t) => /Login page.*In progress.*2026-01-20/.test(t)), "stale task");
  assert.ok(tasks.some((t) => /Owner: \(none\)/.test(t)), "missing owner");
  const issues = load("issues-export.json").chunks.map((c) => c.text).join("\n");
  assert.match(issues, /free tier ends 30 March/); // hidden dependency
  const lead = load("leads-private-notes.md").chunks.map((c) => c.text).join("\n");
  assert.match(lead, /mid April/); // lead-only discussion
});