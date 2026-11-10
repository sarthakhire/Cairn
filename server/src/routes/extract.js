const { Router } = require("express");
const { runExtraction, ExtractionFailed } = require("../services/extraction/pipeline");
const { LlmConfigError } = require("../services/llm");

const router = Router();
let running = false; // one run at a time, so a double click cannot create duplicates

router.post("/", async (req, res) => {
  if (running) return res.status(409).json({ error: "Extraction is already running" });
  running = true;
  try {
    res.json(await runExtraction({ actorId: req.user.id }));
  } catch (err) {
    if (err instanceof ExtractionFailed) return res.status(err.status).json({ error: err.message });
    if (err instanceof LlmConfigError) return res.status(503).json({ error: err.message });
    throw err;
  } finally {
    running = false;
  }
});

module.exports = router;