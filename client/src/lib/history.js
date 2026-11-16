// Helpers for the review history panel (lead only). The server appends entries,
// so the stored order is the order things happened.

const LABELS = {
  accept: 'Accepted',
  edit: 'Edited',
  reject: 'Rejected',
  reopen: 'Reopened (undo)',
}

export function actionLabel(action) {
  return LABELS[action] ?? String(action ?? 'Unknown action')
}

// "draft to accepted", or "stays edited" when an action did not change the state.
export function stateChange(entry) {
  if (!entry || !entry.fromState || !entry.toState) return ''
  if (entry.fromState === entry.toState) return `stays ${entry.toState}`
  return `${entry.fromState} to ${entry.toState}`
}

// True when there is anything worth showing: entries, or an original wording.
export function hasHistory(review) {
  if (!review) return false
  const entries = Array.isArray(review.history) ? review.history : []
  return entries.length > 0 || Boolean(review.originalStatement)
}