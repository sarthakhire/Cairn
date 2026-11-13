const { Router } = require("express");
const { requireRole } = require("../middleware/auth");
const handover = require("../services/handover");
const audit = require("../services/audit");

const router = Router();

// Turns a HandoverError into its status code. Anything else is a real 500.
const guard = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof handover.HandoverError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
};

router.get("/", guard(async (req, res) => {
  res.json(await handover.stateFor(req.user));
}));

router.post("/", requireRole("lead"), guard(async (req, res) => {
  const { number, summary } = await handover.approve(req.user);
  await audit.record({
    actorId: req.user.id,
    action: "Handover approved",
    detail: "Version " + number + ". " + summary.draft + " claims were still draft at approval.",
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
