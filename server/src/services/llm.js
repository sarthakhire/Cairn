const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

// The only file that knows which AI provider is used. To switch providers,
// replace anthropicProvider below. Nothing else needs to change.

class LlmConfigError extends Error {}
class LlmOutputError extends Error {}

const DEFAULT_MODEL = "claude-sonnet-5-5";
const DEFAULT_CACHE_DIR = path.join(__dirname, "..", "..", ".cache", "llm"); // git-ignored
const modelName = () => process.env.LLM_MODEL || DEFAULT_MODEL;

async function anthropicProvider({ system, user }) {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new LlmConfigError("LLM_API_KEY is not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelName(),
      max_tokens: 4096,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  // Only the status is reported: the body could echo source text.
  if (!res.ok) throw new Error("LLM request failed with status " + res.status);

  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

// Models sometimes wrap JSON in code fences or add a sentence around it.
function parseJsonLoose(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a !== -1 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new SyntaxError("No JSON object in model output");
  }
}

// generateJson({ system, user, schema? }) -> validated object.
// Results are cached by a hash of (model, system, user), so retries and demo
// reruns cost nothing. Only output that passed validation is ever cached.
function createGenerator({
  provider = anthropicProvider,
  cacheDir = DEFAULT_CACHE_DIR,
  modelId = modelName,
} = {}) {
  return async function generateJson({ system, user, schema }) {
    const key = crypto.createHash("sha256").update(JSON.stringify([modelId(), system, user])).digest("hex");
    const file = path.join(cacheDir, key + ".json");
    const validate = (v) => (schema ? schema.safeParse(v) : { success: true, data: v });

    try {
      const hit = validate(JSON.parse(await fs.readFile(file, "utf8")));
      if (hit.success) return hit.data;
    } catch {
      // cache miss or unreadable file: fall through to the provider
    }

    let problem = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0 ? user : user + "\n\nYour previous reply could not be used. Reply with the JSON object only.";
      const text = await provider({ system, user: prompt });

      let parsed;
      try {
        parsed = parseJsonLoose(text);
      } catch {
        problem = "was not valid JSON";
        continue;
      }
      const result = validate(parsed);
      if (result.success) {
        await fs.mkdir(cacheDir, { recursive: true }).then(() => fs.writeFile(file, JSON.stringify(parsed))).catch(() => {});
        return result.data;
      }
      problem = "did not match the expected shape";
    }
    throw new LlmOutputError("Model output " + problem + " after 2 attempts");
  };
}

module.exports = {
  generateJson: createGenerator(),
  createGenerator,
  parseJsonLoose,
  LlmConfigError,
  LlmOutputError,
};