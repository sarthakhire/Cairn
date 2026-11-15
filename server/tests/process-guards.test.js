const test = require("node:test");
const assert = require("node:assert");
const { install, rejectionLogger } = require("../src/processGuards");

// The handler is called directly: emitting a real "unhandledRejection" would also reach the test runner's own listener.
test("a rejection is logged with its stack, whatever the reason is", () => {
  const lines = [];
  const handle = rejectionLogger((...a) => lines.push(a.join(" ")));
  handle(new Error("boom"));
  handle("just a string");
  handle(undefined);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("unhandled rejection:"));
  assert.ok(lines[0].includes("boom") && lines[0].includes("at ")); // message and stack
  assert.ok(lines[1].includes("just a string"));
});

test("install can be undone, so tests leave no listener behind", () => {
  const before = process.listenerCount("unhandledRejection");
  const uninstall = install({ log: () => {} });
  assert.equal(process.listenerCount("unhandledRejection"), before + 1);
  uninstall();
  assert.equal(process.listenerCount("unhandledRejection"), before);
});