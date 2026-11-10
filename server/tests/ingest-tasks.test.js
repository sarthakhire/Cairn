const test = require("node:test");
const assert = require("node:assert");
const { rowsToChunks, parseTasks } = require("../src/services/ingest/tasks");
const { IngestError } = require("../src/services/ingest/util");

test("a row becomes 'Task | Owner | Status | Updated' with a date and author", () => {
  const [c] = rowsToChunks([{ task: "Login page", owner: "Karan", status: "In progress", updated: "2026-01-20" }], "tasks.csv");
  assert.equal(c.text, "Task: Login page | Owner: Karan | Status: In progress | Updated: 2026-01-20");
  assert.equal(c.ref, "tasks.csv#1");
  assert.equal(c.author, "Karan");
  assert.equal(c.timestamp.toISOString().slice(0, 10), "2026-01-20");
});

test("an empty owner is written as (none), with no author", () => {
  const [c] = rowsToChunks([{ task: "Handover", owner: "", status: "Open", updated: "2026-02-28" }], "t.csv");
  assert.match(c.text, /Owner: \(none\)/);
  assert.equal(c.author, null);
});

test("rows with no task are skipped and numbering has no gaps", () => {
  const chunks = rowsToChunks([{ task: "a" }, { task: "  ", owner: "x" }, { task: "b" }], "t.csv");
  assert.deepEqual(chunks.map((c) => c.n), [1, 2]);
  assert.match(chunks[1].text, /^Task: b \|/);
});

test("a bad or missing date gives a null timestamp", () => {
  const chunks = rowsToChunks([{ task: "a", updated: "yesterday" }, { task: "b" }], "t.csv");
  assert.equal(chunks[0].timestamp, null);
  assert.equal(chunks[1].timestamp, null);
});

// The tests below use the csv-parse package.

test("parseTasks reads headers in any order and case, and ignores blank lines", () => {
  const csv = "\uFEFFstatus, TASK ,Owner,Updated\nOpen,Fix bug,Riya,2026-02-01\n\nDone,Ship it,,2026-02-02\n";
  const chunks = parseTasks(csv, "t.csv");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].text, "Task: Fix bug | Owner: Riya | Status: Open | Updated: 2026-02-01");
  assert.match(chunks[1].text, /Owner: \(none\)/);
});

test("parseTasks needs a Task column", () => {
  assert.throws(() => parseTasks("Name,Owner\nx,y\n", "t.csv"), (e) => e instanceof IngestError && /Task/.test(e.message));
  assert.throws(() => parseTasks("", "t.csv"), IngestError);
});