// Pure planning for "keep this one": no database. Given the claims that have
// conflict links, works out what every affected claim should look like afterwards.
//
// Rules:
// - The kept claim becomes accepted; the set-aside claim becomes rejected.
// - A rejected claim no longer conflicts with anything, so all its links go.
// - A claim with no links left goes back to the status its evidence earned
//   (baseStatus). Resolving a conflict never makes a claim "verified" by itself.
// - A claim that is still in another conflict stays "conflicting".

function planResolution(claims, keepId, dropId) {
  const byId = new Map(claims.map((c) => [c.claimId, c]));
  const keep = byId.get(keepId);
  const drop = byId.get(dropId);
  const notInConflict = { error: "These claims are not in conflict", status: 409 };

  if (keepId === dropId) return { error: "Pick two different claims", status: 400 };
  if (!keep || !drop) return notInConflict;
  if (!keep.conflictsWith.includes(dropId) || !drop.conflictsWith.includes(keepId)) return notInConflict;

  const updates = [];
  for (const c of claims) {
    const isDrop = c.claimId === dropId;
    const links = isDrop ? [] : c.conflictsWith.filter((id) => id !== dropId);
    const changed = isDrop || links.length !== c.conflictsWith.length;
    if (!changed && c.claimId !== keepId) continue;

    const earned = c.baseStatus && c.baseStatus !== "conflicting" ? c.baseStatus : "uncertain";
    updates.push({
      claimId: c.claimId,
      conflictsWith: links,
      status: links.length ? "conflicting" : earned,
      review: c.claimId === keepId ? "accepted" : isDrop ? "rejected" : null,
    });
  }
  return { updates, keep, drop };
}

module.exports = { planResolution };
