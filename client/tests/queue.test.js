import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_FILTERS, countFor, filterQueue, sortQueue } from '../src/lib/queue.js'

const claim = (id, state, verification, type = 'decision') => ({
  id,
  type,
  verification,
  review: { state },
})

const CLAIMS = [
  claim('c_001', 'accepted', 'verified'),
  claim('c_002', 'draft', 'verified'),
  claim('c_004', 'draft', 'partial', 'ownership'),
  claim('c_006', 'draft', 'none', 'open_question'),
  claim('c_010', 'rejected', 'verified', 'next_action'),
  claim('c_011', 'draft', 'mismatch'),
  claim('c_012', 'draft', 'mismatch', 'risk_dependency'),
  claim('c_005', 'edited', 'verified', 'risk_dependency'),
]

test('the queue opens on drafts only', () => {
  const ids = filterQueue(CLAIMS, DEFAULT_FILTERS).map((c) => c.id)
  assert.deepEqual(ids, ['c_002', 'c_004', 'c_006', 'c_011', 'c_012'])
})

test('filters combine', () => {
  const filters = { state: 'draft', verification: 'mismatch', type: 'risk_dependency' }
  assert.deepEqual(filterQueue(CLAIMS, filters).map((c) => c.id), ['c_012'])
})

test('mismatches come first, then partial, then the rest in id order', () => {
  const sorted = sortQueue(filterQueue(CLAIMS, DEFAULT_FILTERS)).map((c) => c.id)
  assert.deepEqual(sorted, ['c_011', 'c_012', 'c_004', 'c_002', 'c_006'])
})

test('sorting does not change the input list', () => {
  const copy = [...CLAIMS]
  sortQueue(CLAIMS)
  assert.deepEqual(CLAIMS, copy)
})

test('state chip counts ignore the state filter but respect the others', () => {
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'state', 'all'), 8)
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'state', 'draft'), 5)
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'state', 'accepted'), 1)
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'state', 'edited'), 1)
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'state', 'rejected'), 1)
  const mismatchOnly = { ...DEFAULT_FILTERS, state: 'all', verification: 'mismatch' }
  assert.equal(countFor(CLAIMS, mismatchOnly, 'state', 'draft'), 2)
})

test('verification chip counts respect the state filter', () => {
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'verification', 'all'), 5)
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'verification', 'mismatch'), 2)
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'verification', 'partial'), 1)
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'verification', 'verified'), 1)
  assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'verification', 'none'), 1)
})

test('a chip count equals what the list shows after clicking it', () => {
  for (const value of ['mismatch', 'partial', 'verified', 'none']) {
    const clicked = { ...DEFAULT_FILTERS, verification: value }
    assert.equal(countFor(CLAIMS, DEFAULT_FILTERS, 'verification', value), filterQueue(CLAIMS, clicked).length)
  }
})

test('old data without a verification field counts as no source quote', () => {
  const old = [{ id: 'c_001', type: 'decision', review: { state: 'draft' } }]
  assert.equal(countFor(old, DEFAULT_FILTERS, 'verification', 'none'), 1)
  assert.deepEqual(sortQueue(old).map((c) => c.id), ['c_001'])
})

test('empty input is fine', () => {
  assert.deepEqual(filterQueue([], DEFAULT_FILTERS), [])
  assert.equal(countFor([], DEFAULT_FILTERS, 'state', 'draft'), 0)
})