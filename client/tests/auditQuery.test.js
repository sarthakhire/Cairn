import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_AUDIT_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  buildAuditQuery,
  mergeRows,
  validateAuditFilters,
} from '../src/lib/auditQuery.js'

test('empty filters send only the page size', () => {
  assert.equal(buildAuditQuery(EMPTY_AUDIT_FILTERS), `?limit=${PAGE_SIZE}`)
  assert.equal(buildAuditQuery(), `?limit=${PAGE_SIZE}`)
})

test('filters are sent in a fixed order and trimmed', () => {
  const query = buildAuditQuery(
    { actor: ' Demo Lead ', action: 'Rejected', claimId: 'c_014', outcome: 'denied', from: '2026-11-01', to: '2026-11-14' },
    { limit: 20, before: '65f0a' }
  )
  assert.equal(
    query,
    '?actor=Demo+Lead&action=Rejected&claimId=c_014&outcome=denied&from=2026-11-01&to=2026-11-14&limit=20&before=65f0a'
  )
})

test('outcome all is not sent, and unknown outcomes are ignored', () => {
  assert.equal(buildAuditQuery({ outcome: 'all' }), `?limit=${PAGE_SIZE}`)
  assert.equal(buildAuditQuery({ outcome: 'weird' }), `?limit=${PAGE_SIZE}`)
  assert.equal(buildAuditQuery({ outcome: 'allowed' }), `?outcome=allowed&limit=${PAGE_SIZE}`)
})

test('special characters are encoded', () => {
  const query = buildAuditQuery({ actor: 'a&b=c' })
  assert.equal(query, `?actor=a%26b%3Dc&limit=${PAGE_SIZE}`)
})

test('a start date after the end date is refused', () => {
  assert.match(validateAuditFilters({ from: '2026-11-15', to: '2026-11-14' }), /start date/)
  assert.equal(validateAuditFilters({ from: '2026-11-14', to: '2026-11-14' }), '')
  assert.equal(validateAuditFilters({ from: '2026-11-14', to: '' }), '')
  assert.equal(validateAuditFilters(EMPTY_AUDIT_FILTERS), '')
})

test('merging pages never repeats a row', () => {
  const first = [{ id: 'a' }, { id: 'b' }]
  const second = [{ id: 'b' }, { id: 'c' }]
  assert.deepEqual(mergeRows(first, second).map((r) => r.id), ['a', 'b', 'c'])
  assert.deepEqual(mergeRows([], second).map((r) => r.id), ['b', 'c'])
  assert.deepEqual(mergeRows(first, []).map((r) => r.id), ['a', 'b'])
})

test('active filters are counted', () => {
  assert.equal(activeFilterCount(EMPTY_AUDIT_FILTERS), 0)
  assert.equal(activeFilterCount({ ...EMPTY_AUDIT_FILTERS, actor: ' ' }), 0)
  assert.equal(activeFilterCount({ ...EMPTY_AUDIT_FILTERS, actor: 'x', outcome: 'denied' }), 2)
})