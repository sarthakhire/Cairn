// A stand-in for the server, used only while building the UI.
// Turn it on with VITE_USE_MOCK=true in client/.env.development.local.
// It only works on the dev server and is never part of a production build.
// It follows the same rules as the real API: role filtering, approval snapshots,
// reviewer-only fields, and a reason or override where the plan requires one.

import mockClaims from '@/mock/claims.round3.json'
import { redact } from '@/lib/redact'

const RANK = { team: 1, lead_only: 2, restricted: 3 }
const MAX_LEVEL = { incoming_developer: 1, incoming_lead: 2, lead: 3 }
const APPROVED = ['accepted', 'edited']
const PLACEHOLDER = 'Restricted: request access from reviewer'
const LEAD_NAME = 'Demo Lead'
const SESSION_KEY = 'handovertrail.mock-session'

const USERS = {
  'lead@demo.test': { id: 'u_lead', name: LEAD_NAME, email: 'lead@demo.test', role: 'lead' },
  'incoming.lead@demo.test': {
    id: 'u_incoming_lead',
    name: 'Demo Incoming lead',
    email: 'incoming.lead@demo.test',
    role: 'incoming_lead',
  },
  'incoming.dev@demo.test': {
    id: 'u_incoming_developer',
    name: 'Demo Incoming developer',
    email: 'incoming.dev@demo.test',
    role: 'incoming_developer',
  },
}

const clone = (value) => structuredClone(value)
const stamp = () => new Date().toISOString().slice(0, 19)
const short = (text) => (text.length > 80 ? `${text.slice(0, 80)}...` : text)
const wait = () => new Promise((resolve) => setTimeout(resolve, 150))

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSession(next) {
  try {
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage is only a convenience.
  }
}

function summarize(list) {
  return {
    total: list.length,
    verified: list.filter((c) => c.status === 'verified').length,
    conflicts: list.filter((c) => c.status === 'conflicting').length,
    missing: list.filter((c) => c.status === 'missing').length,
    draft: list.filter((c) => c.review.state === 'draft').length,
  }
}

function countChanges(before, after) {
  const seen = new Map(before.map((c) => [c.id, JSON.stringify(c)]))
  let changed = 0
  for (const c of after) {
    if (seen.get(c.id) !== JSON.stringify(c)) changed += 1
    seen.delete(c.id)
  }
  return changed + seen.size
}

const blankReview = () => ({
  state: 'draft',
  by: null,
  at: null,
  edited: false,
  originalStatement: null,
  reason: null,
  override: null,
  history: [],
})

// What an incoming role may see of a review: no reason, override, history or original text.
const publicReview = (r) => ({ state: r.state, by: r.by, at: r.at, edited: Boolean(r.edited) })

// Built field by field so nothing from the real claim can slip through.
function masked(c) {
  return {
    id: c.id,
    type: c.type,
    statement: PLACEHOLDER,
    status: c.status,
    verification: 'none',
    evidence: [],
    visibility: 'restricted',
    review: publicReview(c.review),
    nextAction: null,
    conflictsWith: [],
    inference: false,
  }
}

function viewFor(role, list) {
  if (role === 'lead') return list
  const seen = []
  for (const c of list) {
    if (!APPROVED.includes(c.review.state)) continue
    if (RANK[c.visibility] <= MAX_LEVEL[role]) {
      seen.push({ ...c, review: publicReview(c.review) })
    } else if (c.visibility === 'restricted') {
      seen.push(masked(c))
    }
  }
  const ids = new Set(seen.map((c) => c.id))
  return seen.map((c) => ({ ...c, conflictsWith: c.conflictsWith.filter((id) => ids.has(id)) }))
}

export function createMockApi(ApiError) {
  const fail = (message, status) => {
    throw new ApiError(message, status)
  }

  const claims = clone(mockClaims)
  const resolutions = []
  const audit = []
  const firstAt = '2026-11-14T10:40:00'
  const versions = [
    { number: 1, by: LEAD_NAME, at: firstAt, claims: clone(claims), summary: summarize(claims) },
  ]
  let approval = { by: LEAD_NAME, at: firstAt, version: 1, snapshot: clone(claims) }
  let acknowledgements = {}
  let session = readSession()
  let auditCount = 0

  function log(action, detail, claimId = null, actor = LEAD_NAME, role = 'lead') {
    auditCount += 1
    audit.unshift({
      id: `a_${auditCount}`,
      at: stamp(),
      actor,
      role,
      action,
      outcome: 'allowed',
      claimId,
      detail,
    })
  }

  log('Handover approved', 'Version 1.')

  const user = () => {
    if (!session) fail('Login required', 401)
    return session.user
  }
  const lead = () => {
    const current = user()
    if (current.role !== 'lead') fail('Not allowed', 403)
    return current
  }

  function need(value, min, max, label) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text.length < min || text.length > max) {
      fail(`${label} must be ${min} to ${max} characters.`, 400)
    }
    return text
  }

  function record(claim, action, toState, extra = {}) {
    claim.review.history.push({
      at: stamp(),
      by: LEAD_NAME,
      action,
      fromState: claim.review.state,
      toState,
      fromStatement: null,
      toStatement: null,
      reason: null,
      ...extra,
    })
  }

  function settle(claim, state) {
    claim.review.state = state
    claim.review.by = state === 'draft' ? null : LEAD_NAME
    claim.review.at = state === 'draft' ? null : stamp()
  }

  function approvalInfo(role) {
    const isLead = role === 'lead'
    return {
      approval: approval
        ? { by: approval.by, at: approval.at, version: approval.version }
        : null,
      acknowledgements: isLead
        ? clone(acknowledgements)
        : acknowledgements[role]
          ? { [role]: clone(acknowledgements[role]) }
          : {},
      pendingCount: isLead ? claims.filter((c) => c.review.state === 'draft').length : 0,
      changedCount: isLead && approval ? countChanges(approval.snapshot, claims) : 0,
      nextVersion: versions.length + 1,
      versions: isLead ? clone(versions) : [],
    }
  }

  console.info('[mock api] Running on mock data. Nothing here reaches the server.')

  return {
    currentUser: () => session?.user ?? null,
    onUnauthorized: () => {},

    async login(email) {
      await wait()
      const found = USERS[String(email).trim().toLowerCase()]
      if (!found) fail('Invalid email or password', 401)
      session = { user: { ...found } }
      writeSession(session)
      return { ...found }
    },

    logout() {
      session = null
      writeSession(null)
    },

    async claims() {
      await wait()
      const { role } = user()
      const source = role === 'lead' ? claims : approval ? approval.snapshot : []
      return viewFor(role, clone(source))
    },

    async review(id, action, payload) {
      await wait()
      lead()
      const claim = claims.find((c) => c.id === id)
      if (!claim) fail('Not found', 404)
      const extra = typeof payload === 'string' ? { statement: payload } : payload || {}
      const r = claim.review
      const mismatch = claim.verification === 'mismatch'

      if (action === 'accept') {
        if (r.state !== 'accepted') {
          const override = mismatch ? need(extra.override, 10, 500, 'An override reason') : null
          record(claim, 'accept', 'accepted')
          r.override = override ? { reason: override, by: LEAD_NAME, at: stamp() } : null
          r.reason = null
          settle(claim, 'accepted')
          log('Accepted', short(claim.statement), id)
        }
      } else if (action === 'edit') {
        const text = need(extra.statement, 1, 1000, 'The statement')
        if (text !== claim.statement) {
          const override = mismatch ? need(extra.override, 10, 500, 'An override reason') : null
          record(claim, 'edit', 'edited', { fromStatement: claim.statement, toStatement: text })
          r.originalStatement = r.originalStatement ?? claim.statement
          r.override = override ? { reason: override, by: LEAD_NAME, at: stamp() } : r.override
          r.reason = null
          r.edited = true
          log('Edited', `From: ${short(claim.statement)} To: ${short(text)}`, id)
          claim.statement = text
          settle(claim, 'edited')
        }
      } else if (action === 'reject') {
        const reason = need(extra.reason, 10, 500, 'A reason')
        if (r.state !== 'rejected') {
          record(claim, 'reject', 'rejected', { reason })
          r.reason = reason
          settle(claim, 'rejected')
          log('Rejected', `Reason: ${short(reason)}`, id)
        }
      } else if (action === 'reopen') {
        if (r.state !== 'draft') {
          const reason = typeof extra.reason === 'string' && extra.reason.trim() ? extra.reason.trim() : null
          record(claim, 'reopen', 'draft', { reason })
          r.reason = null
          settle(claim, 'draft')
          log('Reopened', short(claim.statement), id)
        }
      } else {
        fail('Unknown action', 400)
      }
      return clone(claim)
    },

    async resolve(keepId, dropId) {
      await wait()
      lead()
      const keep = claims.find((c) => c.id === keepId)
      const drop = claims.find((c) => c.id === dropId)
      if (!keep || !drop) fail('Not found', 404)
      if (!keep.conflictsWith.includes(dropId)) fail('These claims are not in conflict.', 409)

      record(keep, 'accept', 'accepted')
      keep.status = keep.verification === 'verified' ? 'verified' : 'uncertain'
      keep.conflictsWith = []
      settle(keep, 'accepted')

      record(drop, 'reject', 'rejected', { reason: 'Set aside when a conflict was resolved' })
      drop.status = 'uncertain'
      drop.conflictsWith = []
      drop.review.reason = 'Set aside when a conflict was resolved'
      settle(drop, 'rejected')

      resolutions.unshift({
        keepStatement: keep.statement,
        dropStatement: drop.statement,
        by: LEAD_NAME,
        at: stamp(),
      })
      log('Conflict resolved', `Kept: ${short(keep.statement)} Set aside: ${short(drop.statement)}`)
      return { ok: true }
    },

    async resolutions() {
      await wait()
      lead()
      return clone(resolutions)
    },

    async answer(id, answer) {
      await wait()
      lead()
      const index = claims.findIndex((c) => c.id === id)
      if (index === -1) fail('Not found', 404)
      const original = claims[index]
      const typed = need(answer, 1, 2000, 'The answer')
      const cleaned = redact(typed)
      const question =
        original.status === 'missing' ? original.statement : `Is this correct? ${original.statement}`

      claims.splice(index, 1, {
        id: `c_gap_${Date.now()}`,
        type: original.type,
        statement: `${question} Answer: ${cleaned.text}`,
        status: 'uncertain',
        verification: 'none',
        evidence: [
          {
            quote: cleaned.text,
            source: 'Answer from departing member',
            chunk: 1,
            date: stamp().slice(0, 10),
          },
        ],
        visibility: original.visibility,
        review: blankReview(),
        nextAction: null,
        conflictsWith: [],
        inference: false,
      })
      log('Gap answered', `${short(question)} Answer: ${short(cleaned.text)}`)
      return { redacted: { ...cleaned.counts, total: cleaned.total } }
    },

    async approval() {
      await wait()
      return approvalInfo(user().role)
    },

    async approve() {
      await wait()
      lead()
      if (approval && countChanges(approval.snapshot, claims) === 0) {
        fail(`Version ${approval.version} is already approved and nothing changed.`, 409)
      }
      const number = versions.length + 1
      const at = stamp()
      const pending = claims.filter((c) => c.review.state === 'draft').length
      versions.push({ number, by: LEAD_NAME, at, claims: clone(claims), summary: summarize(claims) })
      approval = { by: LEAD_NAME, at, version: number, snapshot: clone(claims) }
      acknowledgements = {}
      log('Handover approved', `Version ${number}. ${pending} claims were still draft.`)
      return { version: number }
    },

    async revoke() {
      await wait()
      lead()
      approval = null
      acknowledgements = {}
      log('Approval revoked', 'Incoming roles can no longer see the handover.')
      return { ok: true }
    },

    async acknowledge() {
      await wait()
      const current = user()
      if (current.role === 'lead') fail('Not allowed', 403)
      if (!approval) fail('Nothing has been approved yet.', 409)
      if (!acknowledgements[current.role]) {
        acknowledgements[current.role] = { at: stamp() }
        log('Acknowledged', 'Confirmed receipt of the handover.', null, current.name, current.role)
      }
      return { ok: true }
    },

    async audit() {
      await wait()
      lead()
      return clone(audit)
    },

    async sources() {
      await wait()
      lead()
      return []
    },

    async uploadSource() {
      await wait()
      return fail('Source upload is not available in mock mode.', 400)
    },
  }
}