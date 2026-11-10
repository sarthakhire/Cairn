const path = require("path");
const { IngestError } = require("./util");
const { parseNotes } = require("./notes");
const { parseGithub } = require("./github");
const { parseTasks } = require("./tasks");

const KIND_BY_EXT = { ".md": "notes", ".json": "github", ".csv": "tasks" };

function kindFromFilename(filename) {
  return KIND_BY_EXT[path.extname(String(filename)).toLowerCase()] || null;
}

// Returns { kind, chunks } where each chunk is { n, ref, text, author, timestamp, link }.
// Pure: no database, so it is easy to test. The upload route saves the result.
function parseSource(filename, text) {
  const kind = kindFromFilename(filename);
  if (!kind) throw new IngestError("Unsupported file type. Use .md, .json or .csv");
  const parse = { notes: parseNotes, github: parseGithub, tasks: parseTasks }[kind];
  return { kind, chunks: parse(text, filename) };
}

module.exports = { parseSource, kindFromFilename, IngestError };