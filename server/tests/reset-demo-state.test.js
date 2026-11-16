const test = require("node:test");
const assert = require("node:assert");
const { parseArgs } = require("../scripts/reset-demo-state");

const parse = (...flags) => parseArgs(["node", "reset-demo-state.js", ...flags]);

test("flags are read, and nothing is destructive without --yes", () => {
  assert.deepEqual(parse("--versions", "--audit"), { versions: true, audit: true, yes: false, unknown: [] });
  assert.deepEqual(parse("--versions", "--yes"), { versions: true, audit: false, yes: true, unknown: [] });
  assert.deepEqual(parse(), { versions: false, audit: false, yes: false, unknown: [] });
});

test("an unknown flag is reported, so a typo cannot be mistaken for a dry run", () => {
  assert.deepEqual(parse("--version", "--yes").unknown, ["--version"]);
  assert.deepEqual(parse("-y").unknown, ["-y"]);
  assert.equal(parse("--yes").versions, false);
});