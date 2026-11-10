const { Router } = require("express");
const Claim = require("../models/Claim");
const { serializeClaim } = require("../services/serializer");
const {
  APPROVED,
  canReview,
  visibleLevels,
  viewClaim,
  viewClaims,
  stripHiddenConflicts,
} = require("../services/permissions");

const router = Router();

// Chunk text is deliberately not selected: the API only needs n, date and source name.
const POPULATE = [
  { path: "review.reviewerId", select: "name" },
  {
    path: "evidence.chunkId",
    select: "n timestamp sourceId",
    populate: { path: "sourceId", select: "name createdAt" },
  },
];

const load = (filter) =>
  Claim.find(filter).sort({ createdAt: 1, _id: 1 }).populate(POPULATE).lean();

// Narrows the query for non-reviewers. viewClaims is still the final judge.
function roleFilter(role) {
  const filter = { visibility: { $in: visibleLevels(role) } };
  if (!canReview(role)) filter["review.state"] = { $in: APPROVED };
  return filter;
}

router.get("/", async (req, res) => {
  const docs = await load(roleFilter(req.user.role));
  res.json(viewClaims(req.user.role, docs.map(serializeClaim)));
});

router.get("/:id", async (req, res) => {
  const { role } = req.user;
  if (!/^c_\d+$/.test(req.params.id)) return res.status(404).json({ error: "Not found" });

  const [doc] = await load({ claimId: req.params.id });
  const claim = doc && viewClaim(role, serializeClaim(doc));
  // Hidden and missing look identical, so the id of a hidden claim reveals nothing.
  if (!claim) return res.status(404).json({ error: "Not found" });

  let out = claim;
  if (claim.conflictsWith.length > 0) {
    const others = await load({ claimId: { $in: claim.conflictsWith } });
    const visibleIds = new Set(viewClaims(role, others.map(serializeClaim)).map((c) => c.id));
    out = stripHiddenConflicts(claim, visibleIds);
  }
  res.json(out);
});

module.exports = router;