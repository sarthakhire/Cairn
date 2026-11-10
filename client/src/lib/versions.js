export function summarize(claims) {
  return {
    total: claims.length,
    verified: claims.filter((claim) => claim.status === 'verified').length,
    conflicts: claims.filter((claim) => claim.status === 'conflicting').length,
    missing: claims.filter((claim) => claim.status === 'missing').length,
    draft: claims.filter((claim) => claim.review.state === 'draft').length,
  }
}

export function countChanges(snapshot, live) {
  const before = new Map(snapshot.map((claim) => [claim.id, JSON.stringify(claim)]))
  let changed = 0

  for (const claim of live) {
    if (before.get(claim.id) !== JSON.stringify(claim)) changed += 1
    before.delete(claim.id)
  }

  return changed + before.size
}