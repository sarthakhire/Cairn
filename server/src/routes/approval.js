const { Router } = require("express");
const { requireRole } = require("../middleware/auth");
const handover = require("../services/handover");
const audit = require("../services/audit");

const router = Router();

// Turns a HandoverError into its status code. Anything else is a real 500.
// A blocked approval also carries the list of blockers.
const guard = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof handover.HandoverError) {
      const body = { error: err.message };
      if (err.blockers) body.blockers = err.blockers;
      return res.status(err.status).json(body);
    }
    throw err;
  }
};

router.get("/", guard(async (req, res) => {
  res.json(await handover.stateFor(req.user));
}));

router.post("/", requireRole("lead"), guard(async (req, res) => {
  const { number, summary } = await handover.approve(req.user);
  const w = summary.warnings;
  await audit.record({
    actorId: req.user.id,
    action: "Handover approved",
    detail:
      "Version " + number + ". Warnings: " + w.partial + " partial, " + w.uncertain + " uncertain, " +
      w.missing + " missing, " + w.conflicting + " conflicting.",
    after: { version: number, summary },
  });
  res.status(201).json(await handover.stateFor(req.user));
}));

router.delete("/", requireRole("lead"), guard(async (req, res) => {
  await handover.revoke();
  await audit.record({
    actorId: req.user.id,
    action: "Approval revoked",
    detail: "Incoming roles can no longer see the handover.",
  });
  res.json(await handover.stateFor(req.user));
}));

router.post("/acknowledge", requireRole(...handover.INCOMING_ROLES), guard(async (req, res) => {
  const recorded = await handover.acknowledge(req.user);
  if (recorded) {
    await audit.record({
      actorId: req.user.id,
      action: "Acknowledged",
      detail: "Confirmed receipt of the handover.",
    });
  }
  res.json(await handover.stateFor(req.user));
}));

module.exports = router;