// The logic behind the Review queue: filters, counts for each filter chip, and the
// order claims are shown in. Kept free of React so it can be tested on its own.

export const STATE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'edited', label: 'Edited' },
  { value: 'rejected', label: 'Rejected' },
]

export const VERIFICATION_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'mismatch', label: 'Quote mismatch' },
  { value: 'partial', label: 'Partial match' },
  { value: 'verified', label: 'Quote verified' },
  { value: 'none', label: 'No source quote' },
]

export const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'decision', label: 'Decision' },
  { value: 'open_question', label: 'Open question' },
  { value: 'ownership', label: 'Ownership' },
  { value: 'risk_dependency', label: 'Risk or dependency' },
  { value: 'next_action', label: 'Next action' },
]

// The queue opens on what still needs a decision.
export const DEFAULT_FILTERS = { state: 'draft', verification: 'all', type: 'all' }

// Old data has no verification field: treat it as "no source quote".
const GROUPS = {
  state: (claim) => claim.review?.state ?? 'draft',
  verification: (claim) => claim.verification ?? 'none',
  type: (claim) => claim.type,
}

function matches(claim, filters, skip) {
  return Object.keys(GROUPS).every(
    (group) => group === skip || filters[group] === 'all' || GROUPS[group](claim) === filters[group]
  )
}

export function filterQueue(claims, filters) {
  return claims.filter((claim) => matches(claim, filters, null))
}

// How many claims a chip would show, given the other two filters. The number on a
// chip therefore always equals what you see after clicking it.
export function countFor(claims, filters, group, value) {
  return claims.filter(
    (claim) => matches(claim, filters, group) && (value === 'all' || GROUPS[group](claim) === value)
  ).length
}

// Mismatches first, then partial matches, then the rest. Claim ids break ties.
const RANK = { mismatch: 0, partial: 1 }

export function sortQueue(claims) {
  return [...claims].sort((a, b) => {
    const ra = RANK[GROUPS.verification(a)] ?? 2
    const rb = RANK[GROUPS.verification(b)] ?? 2
    if (ra !== rb) return ra - rb
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  })
}