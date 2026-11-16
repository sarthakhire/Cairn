const { Router } = require("express");
const demo = require("../services/demoRestore");
const audit = require("../services/audit");

const router = Router();
let running = false; // two clicks at once must not run two restores

// Only mounted behind ALLOW_DEMO_RESET=true and the reviewer role (see app.js).
router.post("/reset", async (req, res) => {
  if (!req.body || req.body.confirm !== "restore") {
    return res.status(400).json({ error: 'Send { "confirm": "restore" } to restore the demo data' });
  }
  if (running) return res.status(409).json({ error: "A restore is already running" });
  running = true;
  try {
    let text;
    try {
      text = demo.loadSnapshotText();
    } catch (err) {
      if (err instanceof demo.SnapshotError) return res.status(404).json({ error: "No demo snapshot is deployed on this server" });
      throw err;
    }
    const models = {};
    for (const name of [...demo.REQUIRED, ...demo.OPTIONAL, "User"]) models[name] = require("../models/" + name);
    let result;
    try {
      result = await demo.restoreDemo({ models, text });
    } catch (err) {
      if (err instanceof demo.SnapshotError) return res.status(422).json({ error: err.message });
      throw err;
    }
    await audit.record({
      actorId: req.user.id,
      action: "Demo data restored",
      detail: result.counts.Claim + " claims, " + result.counts.Source + " sources put back.",
    });
    res.json({ ok: true, claims: result.counts.Claim, sources: result.counts.Source, transactional: result.transactional });
  } finally {
    running = false;
  }
});

module.exports = router;