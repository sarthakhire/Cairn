// Rules for PATCH /api/claims/:id. Pure: no database, no HTTP. Given the stored claim and the
// request, it returns an error, a no-op, or the exact update to write.
const { claimVerification } = require("./serializer");

const REASON_MIN = 10;
const REASON_MAX = 500;
const STATEMENT_MAX = 1000;

const NEXT_STATE = { accept: "accepted", edit: "edited", reject: "rejected", reopen: "draft" };
const LABEL = { accept: "Accepted", edit: "Edited", reject: "Rejected", reopen: "Reopened" };

const text = (v) => (typeof v === "string" ? v.trim() : "");
const cut = (s) => (s.length <= 80 ? s : s.slice(0, 80) + "..."); // same as versions.short
const bad = (error) => ({ error, status: 400 });
const reasonOk = (s) => s.length >= REASON_MIN && s.length <= REASON_MAX;

// claim: the stored claim (raw, evidence flags and match as saved).
// body: { action, statement?, reason?, override? }. user: { id, name }.
function planReview({ claim, body, user, now = new Date() }) {
  const action = body && body.action;
  if (!Object.hasOwn(NEXT_STATE, action)) {
    return bad('Send { "action": "accept" | "reject" | "edit" | "reopen" }');
  }
  const review = claim.review || {};
  const from = review.state || "draft";
  const to = NEXT_STATE[action];
  const reason = text(body.reason);
  const override = text(body.override);
  const statement = text(body.statement);

  // 1. Input rules. Bad input is always a 400, even when the action would otherwise change nothing.
  if (action === "reject" && !reasonOk(reason)) return bad("A reason of 10 to 500 characters is required to reject a claim");
  if (action === "reopen" && reason.length > REASON_MAX) return bad("The reason can be at most 500 characters");
  if (action === "edit" && (statement.length === 0 || statement.length > STATEMENT_MAX)) {
    return bad("Send the new statement (1 to 1000 characters)");
  }
  if ((action === "accept" || action === "edit") && override && !reasonOk(override)) {
    return bad("The override reason must be 10 to 500 characters");
  }

  // 2. Repeating an action on the state it already leaves the claim in changes nothing.
  if (action === "accept" && (from === "accepted" || from === "edited")) return { noop: true };
  if (action === "reject" && from === "rejected") return { noop: true };
  if (action === "reopen" && from === "draft") return { noop: true };
  if (action === "edit" && statement === claim.statement) {
    return from === "edited" ? { noop: true } : bad("The statement is unchanged");
  }

  // 3. A claim whose quote does not match its source needs a written reason to be accepted or edited.
  if ((action === "accept" || action === "edit") && !override && claimVerification(claim.evidence) === "mismatch") {
    return bad("The quote for this claim does not match its source. Give a reason (10 to 500 characters) to keep it anyway.");
  }

  const toStatement = action === "edit" ? statement : claim.statement;
  const entryReason = action === "reject" || action === "reopen" ? reason || null : override || null;
  const by = { byId: user.id, byName: user.name };

  const set = {
    "review.state": to,
    // A draft is unreviewed, so reopening clears who and when. The history keeps who reopened it.
    "review.reviewerId": action === "reopen" ? null : user.id,
    "review.at": action === "reopen" ? null : now,
    "review.reason": action === "reject" ? reason : null,
    "review.override": (action === "accept" || action === "edit") && override ? { reason: override, ...by, at: now } : null,
  };
  if (action === "edit") {
    set.statement = statement;
    if (!review.originalStatement) set["review.originalStatement"] = claim.statement; // first edit only
  }

  const entry = {
    at: now,
    ...by,
    action,
    fromState: from,
    toState: to,
    fromStatement: claim.statement,
    toStatement,
    reason: entryReason,
  };

  let detail;
  if (action === "edit") detail = "From: " + cut(claim.statement) + " To: " + cut(statement);
  else detail = cut(claim.statement);
  if (entryReason) detail += (action === "reject" || action === "reopen" ? " Reason: " : " Override: ") + cut(entryReason);

  return {
    from,
    to,
    set,
    push: { "review.history": entry },
    audit: {
      action: LABEL[action],
      detail,
      before: { statement: claim.statement, state: from },
      after: { statement: toStatement, state: to, reason: entryReason },
    },
  };
}

module.exports = { planReview, REASON_MIN, REASON_MAX, STATEMENT_MAX };