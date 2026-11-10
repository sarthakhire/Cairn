const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { z } = require("zod");
const { createGenerator, parseJsonLoose, LlmOutputError } = require("../src/services/llm");

const schema = z.object({ ok: z.boolean() });
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "cairn-llm-"));

test("parseJsonLoose handles fences and surrounding text", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! {"a":1} Hope that helps'), { a: 1 });
  assert.throws(() => parseJsonLoose("no json here"));
});

test("identical prompts hit the cache, the provider is called once", async () => {
  let calls = 0;
  const gen = createGenerator({ provider: async () => (calls++, '{"ok":true}'), cacheDir: await tmp(), modelId: () => "m" });
  assert.deepEqual(await gen({ system: "s", user: "u", schema }), { ok: true });
  assert.deepEqual(await gen({ system: "s", user: "u", schema }), { ok: true });
  assert.equal(calls, 1);
  await gen({ system: "s", user: "different", schema });
  assert.equal(calls, 2);
});

test("a changed model is a different cache key", async () => {
  let calls = 0;
  const dir = await tmp();
  let model = "a";
  const gen = createGenerator({ provider: async () => (calls++, '{"ok":true}'), cacheDir: dir, modelId: () => model });
  await gen({ system: "s", user: "u", schema });
  model = "b";
  await gen({ system: "s", user: "u", schema });
  assert.equal(calls, 2);
});

test("one bad reply is retried, then accepted", async () => {
  const replies = ["not json", '{"ok":true}'];
  const prompts = [];
  const gen = createGenerator({
    provider: async ({ user }) => (prompts.push(user), replies.shift()),
    cacheDir: await tmp(),
    modelId: () => "m",
  });
  assert.deepEqual(await gen({ system: "s", user: "u", schema }), { ok: true });
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes("JSON object only"));
});

test("two bad replies throw LlmOutputError and nothing invalid is cached", async () => {
  const dir = await tmp();
  let calls = 0;
  const gen = createGenerator({ provider: async () => (calls++, '{"ok":"yes"}'), cacheDir: dir, modelId: () => "m" });
  await assert.rejects(() => gen({ system: "s", user: "u", schema }), LlmOutputError);
  assert.equal(calls, 2);
  assert.deepEqual(await fs.readdir(dir).catch(() => []), []);
});

test("a cached value that no longer matches the schema is ignored", async () => {
  const dir = await tmp();
  let calls = 0;
  const gen1 = createGenerator({ provider: async () => (calls++, '{"ok":true}'), cacheDir: dir, modelId: () => "m" });
  await gen1({ system: "s", user: "u" }); // cached without a schema
  const gen2 = createGenerator({ provider: async () => (calls++, '{"ok":false}'), cacheDir: dir, modelId: () => "m" });
  assert.deepEqual(await gen2({ system: "s", user: "u", schema: z.object({ ok: z.literal(false) }) }), { ok: false });
  assert.equal(calls, 2);
});