const test = require("node:test");
const assert = require("node:assert");
const { redact, MASK } = require("../src/services/redact");

test("a keyed credential keeps its label and loses its value", () => {
  const out = redact("The password is hunter2abc and the api key: sk-abcdefghij123456");
  assert.ok(!out.text.includes("hunter2abc"));
  assert.ok(!out.text.includes("sk-abcdefghij123456"));
  assert.ok(out.text.includes("password is " + MASK));
  assert.equal(out.counts.credential, 2);
});

test("credential-shaped tokens are masked even with no label", () => {
  const out = redact("use ghp_abcdefghijklmnop for the repo");
  assert.equal(out.text, "use " + MASK + " for the repo");
  assert.equal(out.counts.credential, 1);
});

test("emails and phone numbers are masked and counted", () => {
  const out = redact("Mail ravi@example.com or call 98765 43210 or 555-123-4567");
  assert.ok(!/ravi@example\.com|98765|555-123/.test(out.text));
  assert.equal(out.counts.email, 1);
  assert.equal(out.counts.phone, 2);
  assert.equal(out.total, 3);
});

test("plain text passes through untouched with zero counts", () => {
  const out = redact("Ask Priya about the deploy; she owns the release checklist.");
  assert.equal(out.text, "Ask Priya about the deploy; she owns the release checklist.");
  assert.equal(out.total, 0);
});

test("redacting twice changes nothing the second time", () => {
  const once = redact("password: abc12345 and me@x.io").text;
  const twice = redact(once);
  assert.equal(twice.text, once);
  assert.equal(twice.total, 0);
});
