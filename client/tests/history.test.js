import test from 'node:test'
import assert from 'node:assert/strict'
import { actionLabel, hasHistory, stateChange } from '../src/lib/history.js'

test('every review action has a readable label', () => {
  assert.equal(actionLabel('accept'), 'Accepted')
  assert.equal(actionLabel('edit'), 'Edited')
  assert.equal(actionLabel('reject'), 'Rejected')
  assert.equal(actionLabel('reopen'), 'Reopened (undo)')
})

test('an unknown or missing action does not throw', () => {
  assert.equal(actionLabel('archive'), 'archive')
  assert.equal(actionLabel(undefined), 'Unknown action')
  assert.equal(actionLabel(null), 'Unknown action')
})

test('state change reads as a short phrase', () => {
  assert.equal(stateChange({ fromState: 'draft', toState: 'accepted' }), 'draft to accepted')
  assert.equal(stateChange({ fromState: 'edited', toState: 'edited' }), 'stays edited')
  assert.equal(stateChange({ fromState: 'draft' }), '')
  assert.equal(stateChange(undefined), '')
})

test('hasHistory is true for entries or an original wording', () => {
  assert.equal(hasHistory({ history: [{ action: 'accept' }] }), true)
  assert.equal(hasHistory({ history: [], originalStatement: 'Before' }), true)
  assert.equal(hasHistory({ history: [] }), false)
  assert.equal(hasHistory({ originalStatement: null }), false)
})

test('old reviews without history fields are handled', () => {
  assert.equal(hasHistory({ state: 'accepted', by: 'Lead', at: '2026-03-02T18:40:00' }), false)
  assert.equal(hasHistory(undefined), false)
  assert.equal(hasHistory(null), false)
})