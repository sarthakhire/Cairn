// Pure helpers for the audit trail view: the query string for
// GET /api/audit/events, validation of the filter form, and merging pages.

export const PAGE_SIZE = 50

export const EMPTY_AUDIT_FILTERS = {
  actor: '',
  action: '',
  claimId: '',
  outcome: 'all',
  from: '',
  to: '',
}

// Empty fields are left out. The cursor `before` is the id of the last row of the
// previous page.
export function buildAuditQuery(filters = {}, { before = null, limit = PAGE_SIZE } = {}) {
  const params = new URLSearchParams()
  const add = (key, value) => {
    const text = String(value ?? '').trim()
    if (text) params.set(key, text)
  }
  add('actor', filters.actor)
  add('action', filters.action)
  add('claimId', filters.claimId)
  if (filters.outcome === 'allowed' || filters.outcome === 'denied') {
    params.set('outcome', filters.outcome)
  }
  add('from', filters.from)
  add('to', filters.to)
  params.set('limit', String(limit))
  add('before', before)
  return `?${params.toString()}`
}

// Dates from <input type="date"> are YYYY-MM-DD, so plain string comparison works.
export function validateAuditFilters(filters) {
  if (filters.from && filters.to && filters.from > filters.to) {
    return 'The start date is after the end date.'
  }
  return ''
}

// Adds a new page after the rows already loaded, skipping any row seen before.
export function mergeRows(existing, incoming) {
  const seen = new Set(existing.map((row) => row.id))
  return [...existing, ...incoming.filter((row) => !seen.has(row.id))]
}

export function activeFilterCount(filters) {
  return [
    filters.actor,
    filters.action,
    filters.claimId,
    filters.outcome !== 'all' ? filters.outcome : '',
    filters.from,
    filters.to,
  ].filter((value) => String(value ?? '').trim()).length
}