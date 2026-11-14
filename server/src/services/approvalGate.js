// The rules that decide whether a handover may be approved. Pure: no database.
// Input is the reviewer's view of every claim, in the API shape (see serializer.js).

const reviewState = (c) => (c.review && c.review.state) || null;

// An override is the reviewer's written reason for accepting a claim whose quote
// does not match the source. Added to the claim by the review workflow.
const hasOverride = (c) => !!(c.review && c.review.override);

// Things that stop approval:
//  - any claim still a draft
//  - an accepted or edited claim whose evidence check is "mismatch", unless overridden
// Rejected claims never block. Partial, uncertain, missing and conflicting claims
// do not block either: they are counted as warnings (see warningCounts).
function findBlockers(claims) {
  const out = [];
  for (const c of claims || []) {
    const state = reviewState(c);
    if (state === "draft") {
      out.push({ id: c.id, kind: "draft", message: "Still a draft" });
    } else if ((state === "accepted" || state === "edited") && c.verification === "mismatch" && !hasOverride(c)) {
      out.push({ id: c.id, kind: "mismatch", message: "Accepted but the quote does not match the source" });
    }
  }
  return out;
}

// Warning counts over the claims that will actually be shared (accepted or edited).
function warningCounts(claims) {
  const out = { partial: 0, uncertain: 0, missing: 0, conflicting: 0 };
  for (const c of claims || []) {
    const state = reviewState(c);
    if (state !== "accepted" && state !== "edited") continue;
    if (c.verification === "partial") out.partial++;
    if (c.status === "uncertain") out.uncertain++;
    if (c.status === "missing") out.missing++;
    if (c.status === "conflicting") out.conflicting++;
  }
  return out;
}

// Key order and undefined fields must not matter when comparing two snapshots.
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map((x) => stable(x)).join(",") + "]";
  if (v instanceof Date) return JSON.stringify(v);
  if (v && typeof v === "object") {
    return (
      "{" +
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(v[k]))
        .join(",") +
      "}"
    );
  }
  const s = JSON.stringify(v);
  return s === undefined ? "null" : s;
}

const sameClaims = (a, b) => stable(a) === stable(b);

module.exports = { findBlockers, warningCounts, sameClaims, hasOverride };