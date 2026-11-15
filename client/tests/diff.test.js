import test from 'node:test'
import assert from 'node:assert/strict'
import { diffWords, stripEdgeEllipsis } from '../src/lib/diff.js'

const changed = (side) => side.filter((w) => w.changed).map((w) => w.text)

test('identical text has no changed words', () => {
  const { left, right } = diffWords('Free tier ends 30 March', 'Free tier ends 30 March')
  assert.deepEqual(changed(left), [])
  assert.deepEqual(changed(right), [])
})

test('a changed month is the only word marked', () => {
  const { left, right } = diffWords(
    'free tier ends 30 April, after that we need a paid plan',
    'Free tier ends 30 March, after that we need a paid plan.'
  )
  assert.deepEqual(changed(left), ['April,'])
  assert.deepEqual(changed(right), ['March,'])
})

test('case and punctuation at the edges are ignored', () => {
  const { left, right } = diffWords('Hello, world.', 'hello world')
  assert.deepEqual(changed(left), [])
  assert.deepEqual(changed(right), [])
})

test('a flipped negation shows as a changed word', () => {
  const { left, right } = diffWords(
    'reviews are not required before merging',
    'Reviews are required before merging.'
  )
  assert.deepEqual(changed(left), ['not'])
  assert.deepEqual(changed(right), [])
})

test('a typo marks one word on each side', () => {
  const { left, right } = diffWords(
    'every pull request needs one review befor merging',
    'Every pull request needs one review before merging.'
  )
  assert.deepEqual(changed(left), ['befor'])
  assert.deepEqual(changed(right), ['before'])
})

test('a fabricated quote is marked almost entirely', () => {
  const { left } = diffWords(
    'nightly auto deploy runs at 2 am sharp',
    'Deploys are manual. Riya runs them after the lead says go.'
  )
  assert.ok(changed(left).length >= 6)
})

test('empty and missing input does not throw', () => {
  assert.deepEqual(diffWords('', ''), { left: [], right: [] })
  assert.deepEqual(diffWords(undefined, null), { left: [], right: [] })
  assert.equal(diffWords('one two', '').left.every((w) => w.changed), true)
})

test('edge ellipses are removed, inner dots are kept', () => {
  assert.equal(stripEdgeEllipsis('...free tier ends...'), 'free tier ends')
  assert.equal(stripEdgeEllipsis('\u2026free tier\u2026'), 'free tier')
  assert.equal(stripEdgeEllipsis('wait... what'), 'wait... what')
  assert.equal(stripEdgeEllipsis(undefined), '')
})