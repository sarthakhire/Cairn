const { parseDate, pushChunks, IngestError } = require("./util");

// Expected CSV header (any order, any case): Task, Owner, Status, Updated
// One chunk per row:  Task: ... | Owner: ... | Status: ... | Updated: ...
// An empty cell becomes "(none)", so a missing owner is explicit text that both the
// model and a later rule can see: "Owner: (none)".

const NONE = "(none)";

function rowsToChunks(rows, filename) {
  const chunks = [];
  for (const row of rows) {
    const task = String(row.task || "").trim();
    if (!task) continue; // a row with no task is not a task
    const owner = String(row.owner || "").trim();
    const status = String(row.status || "").trim();
    const updated = String(row.updated || "").trim();
    pushChunks(
      chunks,
      filename,
      "Task: " + task + " | Owner: " + (owner || NONE) + " | Status: " + (status || NONE) + " | Updated: " + (updated || NONE),
      { author: owner, timestamp: parseDate(updated) }
    );
  }
  return chunks;
}

function parseTasks(text, filename) {
  const { parse } = require("csv-parse/sync"); // loaded here so rowsToChunks can be tested without it
  let header = [];
  let rows;
  try {
    rows = parse(String(text), {
      columns: (h) => {
        header = h.map((x) => String(x).trim().toLowerCase());
        return header;
      },
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (e) {
    throw new IngestError("Could not read the CSV: " + e.message);
  }
  if (!header.includes("task")) {
    throw new IngestError('The CSV needs a "Task" column (and can have Owner, Status, Updated)');
  }
  return rowsToChunks(rows, filename);
}

module.exports = { parseTasks, rowsToChunks, NONE };