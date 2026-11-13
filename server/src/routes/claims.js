const { Router } = require("express");
const { z } = require("zod");
const Claim = require("../models/Claim");
const { requireRole } = require("../middleware/auth");
const { load, loadSerialized } = require("../services/claimStore");
const { serializeClaim } = require("../services/serializer");
const { canReview, viewClaims } = require("../services/permissions");
const { currentApproval } = require("../services/handover");
const { short } = require("../services/versions");
const { planResolution } = require("../services/resolution");
const { AnswerError, answerGap } = require("../services/answers");
const AuditLog = require("../models/AuditLog");
const audit = require("../services/audit");

const router = Router();
const ID = /^c_\d+$/;

// Everything this role may read, already through the permission gate.
// The reviewer sees the live claims. Everyone else sees only the approved
// snapshot, and nothing at all until a version has been approved.
async function visibleClaims(role) {
  if (canReview(role)) return viewClaims(role, await loadSerialized({}));
  const approved = await currentApproval();
  if (!approved) return [];
  return viewClaims(role, approved.claims);
}

router.get("/", async (req, res) => {
  res.json(await visibleClaims(req.user.role));
});

// The log of resolved conflicts, newest first (reviewer only). Declared before "/:id".
router.get("/resolutions", requireRole("lead"), async (req, res) => {
  const rows = await AuditLog.find({ action: "Conflict resolved" }).sort({ at: -1, _id: -1 }).populate("actorId", "name").lean();
  res.json(
    rows.map((r) => ({
      keepId: r.after && r.after.keepId,
      dropId: r.after && r.after.dropId,
      keepStatement: r.after && r.after.keepStatement,
      dropStatement: r.after && r.after.dropStatement,
      by: r.actorId && r.actorId.name ? r.actorId.name : "Unknown",
      at: new Date(r.at).toISOString().slice(0, 19),
    }))
  );
});

router.get("/:id", async (req, res) => {
  if (!ID.test(req.params.id)) return res.status(404).json({ error: "Not found" });
  const claim = (await visibleClaims(req.user.role)).find((c) => c.id === req.params.id);
  // Hidden and missing look identical, so the id of a hidden claim reveals nothing.
  if (!claim) return res.status(404).json({ error: "Not found" });
  res.json(claim);
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("edit"), statement: z.string().trim().min(1).max(1000) }),
]);
const STATE = { accept: "accepted", reject: "rejected", edit: "edited" };
const LABEL = { accept: "Accepted", reject: "Rejected", edit: "Edited" };

// Review one claim. Only the statement and the review fields can change here:
// evidence and status are never touched, so an edit can never make a claim "verified".
router.patch("/:id", requireRole("lead"), async (req, res) => {
  const { id } = req.params;
  if (!ID.test(id)) return res.status(404).json({ error: "Not found" });

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Send { "action": "accept" | "reject" | "edit" }, and a statement for edit' });
  }

  const [before] = await load({ claimId: id });
  if (!before) return res.status(404).json({ error: "Not found" });

  const { action } = parsed.data;
  if (action === "edit" && parsed.data.statement === before.statement) {
    return res.status(400).json({ error: "The statement is unchanged" });
  }

  const set = {
    "review.state": STATE[action],
    "review.reviewerId": req.user.id,
    "review.at": new Date(),
  };
  if (action === "edit") set.statement = parsed.data.statement;
  await Claim.updateOne({ claimId: id }, { $set: set });

  const [after] = await load({ claimId: id });
  await audit.record({
    actorId: req.user.id,
    action: LABEL[action],
    claimId: id,
    detail:
      action === "edit"
        ? "From: " + short(before.statement) + " To: " + short(parsed.data.statement)
        : short(before.statement),
    before: { statement: before.statement, state: before.review && before.review.state },
    after: { statement: after.statement, state: after.review.state },
  });
  res.json(serializeClaim(after));
});

const resolveSchema = z.object({ keepId: z.string().regex(ID), dropId: z.string().regex(ID) });

// Two claims disagree and the reviewer picks one. See services/resolution.js for the rules.
router.post("/resolve", requireRole("lead"), async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Send { "keepId": "c_001", "dropId": "c_002" }' });
  const { keepId, dropId } = parsed.data;

  const linked = await Claim.find({ "conflictsWith.0": { $exists: true } }).lean();
  const plan = planResolution(linked, keepId, dropId);
  if (plan.error) return res.status(plan.status).json({ error: plan.error });

  const at = new Date();
  await Claim.bulkWrite(
    plan.updates.map((u) => {
      const set = { status: u.status, conflictsWith: u.conflictsWith };
      if (u.review) {
        set["review.state"] = u.review;
        set["review.reviewerId"] = req.user.id;
        set["review.at"] = at;
      }
      return { updateOne: { filter: { claimId: u.claimId }, update: { $set: set } } };
    })
  );

  await audit.record({
    actorId: req.user.id,
    action: "Conflict resolved",
    claimId: keepId,
    detail: "Kept: " + short(plan.keep.statement) + " Set aside: " + short(plan.drop.statement),
    after: { keepId, dropId, keepStatement: plan.keep.statement, dropStatement: plan.drop.statement },
  });

  const changed = await load({ claimId: { $in: plan.updates.map((u) => u.claimId) } });
  res.json({ claims: changed.map(serializeClaim) });
});

const answerSchema = z.object({ answer: z.string().trim().min(1).max(2000) });

// The departing member answers an open question. Sensitive items are masked before anything is stored.
router.post("/:id/answer", requireRole("lead"), async (req, res) => {
  if (!ID.test(req.params.id)) return res.status(404).json({ error: "Not found" });
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Send { "answer": "text" } (1 to 2000 characters)' });

  let result;
  try {
    result = await answerGap({ claimId: req.params.id, answer: parsed.data.answer, user: req.user });
  } catch (err) {
    if (err instanceof AnswerError) return res.status(err.status).json({ error: err.message });
    throw err;
  }

  await audit.record({
    actorId: req.user.id,
    action: "Gap answered",
    claimId: result.newId,
    detail:
      short(result.question) + " Answer: " + short(result.text) +
      (result.redacted.total > 0 ? " (" + result.redacted.total + " redacted)" : ""),
    before: { claimId: result.oldId, statement: result.original.statement },
    after: { claimId: result.newId },
  });

  const [created] = await load({ claimId: result.newId });
  res.status(201).json({ claim: serializeClaim(created), replaced: result.oldId, redacted: result.redacted });
});

module.exports = router;
