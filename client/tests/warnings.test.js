import test from 'node:test'
import assert from 'node:assert/strict'
import { countWarnings, totalWarnings } from '../src/lib/warnings.js'

const claim = (status, verification, state = 'draft') => ({
  status,
  verification,
  review: { state },
})

test('counts each kind of warning', () => {
  const warnings = countWarnings([
    claim('verified', 'verified'),
    claim('uncertain', 'partial'),
    claim('uncertain', 'mismatch'),
    claim('missing', 'none'),
    claim('conflicting', 'verified'),
    claim('conflicting', 'verified'),
  ])
  assert.deepEqual(warnings, { partial: 1, uncertain: 2, missing: 1, conflicting: 2 })
  assert.equal(totalWarnings(warnings), 6)
})

test('rejected claims are not counted', () => {
  const warnings = countWarnings([
    claim('uncertain', 'partial', 'rejected'),
    claim('missing', 'none', 'rejected'),
    claim('uncertain', 'partial', 'accepted'),
  ])
  assert.deepEqual(warnings, { partial: 1, uncertain: 1, missing: 0, conflicting: 0 })
})

test('old data without a verification field does not throw', () => {
  const warnings = countWarnings([{ status: 'uncertain', review: { state: 'draft' } }, { status: 'verified' }])
  assert.deepEqual(warnings, { partial: 0, uncertain: 1, missing: 0, conflicting: 0 })
})

test('empty and missing input gives zeros', () => {
  assert.deepEqual(countWarnings([]), { partial: 0, uncertain: 0, missing: 0, conflicting: 0 })
  assert.deepEqual(countWarnings(undefined), { partial: 0, uncertain: 0, missing: 0, conflicting: 0 })
  assert.equal(totalWarnings(null), 0)
})