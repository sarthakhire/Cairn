// Pure helpers, no database. Same logic as client/src/lib/versions.js so the
// numbers the server sends match what the UI used to compute itself.

function summarize(claims) {
  return {
    total: claims.length,
    verified: claims.filter((c) => c.status === "verified").length,
    conflicts: claims.filter((c) => c.status === "conflicting").length,
    missing: claims.filter((c) => c.status === "missing").length,
    draft: claims.filter((c) => c.review.state === "draft").length,
  };
}

// How many claims differ between an approved snapshot and the live claims
// (changed, added or removed).
function countChanges(snapshot, live) {
  const before = new Map(snapshot.map((c) => [c.id, JSON.stringify(c)]));
  let changed = 0;
  for (const c of live) {
    if (before.get(c.id) !== JSON.stringify(c)) changed += 1;
    before.delete(c.id);
  }
  return changed + before.size;
}

const short = (text, max = 80) => (text.length > max ? text.slice(0, max) + "..." : text);

module.exports = { summarize, countChanges, short };
