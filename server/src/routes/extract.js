const { Router } = require("express");
const pipeline = require("../services/extraction/pipeline");
const { LlmConfigError, LlmRateLimitError } = require("../services/llm");
const { describeExtractionError, MESSAGES } = require("../services/extraction/errors");

const router = Router();
const CLASSES = { LlmConfigError, LlmRateLimitError, ExtractionFailed: pipeline.ExtractionFailed };

// One run at a time, so a double click cannot create duplicates. The state of the latest run is kept in
// memory (there is one server), so a client that started a background run can come back and ask how it went.
const fresh = () => ({ state: "idle", startedAt: null, finishedAt: null, summary: null, error: null });
let run = fresh();

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 19) : null);
const view = () => ({
  state: run.state, // idle, running, done or failed
  startedAt: iso(run.startedAt),
  finishedAt: iso(run.finishedAt),
  seconds: run.startedAt ? Math.round(((run.finishedAt || new Date()) - run.startedAt) / 1000) : null,
  summary: run.summary,
  error: run.error,
});

// Starts a run and keeps its state up to date. The returned promise still rejects on failure.
function begin(actorId) {
  run = { ...fresh(), state: "running", startedAt: new Date() };
  return pipeline.runExtraction({ actorId }).then(
    (summary) => {
      run = { ...run, state: "done", finishedAt: new Date(), summary };
      return summary;
    },
    (err) => {
      const info = describeExtractionError(err, CLASSES);
      run = { ...run, state: "failed", finishedAt: new Date(), error: info ? info.message : MESSAGES.unexpected };
      throw err;
    }
  );
}

// The latest run: { state, startedAt, finishedAt, seconds, summary, error }. Reviewer only (see app.js).
router.get("/", (req, res) => res.json(view()));

// A full run reads every source and asks the AI model many questions, one at a time, so it can take
// several minutes. By default the request waits for the result. With ?background=1 it answers 202
// at once and the client polls GET /api/extract.
router.post("/", async (req, res) => {
  if (run.state === "running") return res.status(409).json({ error: MESSAGES.running });

  const promise = begin(req.user.id);

  if (req.query.background === "1") {
    promise.catch((err) => {
      if (!describeExtractionError(err, CLASSES)) console.error("extraction failed:", err);
    });
    return res.status(202).json(view());
  }

  try {
    res.json(await promise);
  } catch (err) {
    const info = describeExtractionError(err, CLASSES);
    if (!info) throw err;
    if (info.retryAfter) res.set("Retry-After", String(info.retryAfter));
    res.status(info.status).json({ error: info.message });
  }
});

router.reset = () => {
  run = fresh(); // for tests
};

module.exports = router;