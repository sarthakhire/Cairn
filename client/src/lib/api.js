// The only place the app talks to the server. Everything else imports `api`.
//
// The server decides what each role may see. This file never filters or
// hides anything: it sends the signed-in user's token and returns what comes back.

import { createMockApi } from '@/lib/mockApi'
import { buildAuditQuery } from '@/lib/auditQuery'
const BASE = (import.meta.env?.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '')
const KEY = 'handovertrail.session'

export class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body // the parsed error response, for example { error, blockers }
  }
}
function readSession() {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null // storage blocked or the saved value is damaged
  }
}

let session = readSession()
let unauthorizedHandler = null

function writeSession(next) {
  session = next
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next))
    else sessionStorage.removeItem(KEY)
  } catch {
    // Storage is only a convenience: without it the user signs in again after a refresh.
  }
}

const TIMEOUT_MS = 20000
const LONG_TIMEOUT_MS = 120000 // uploads can be slow on free hosting

async function request(method, path, { body, form, timeoutMs = TIMEOUT_MS } = {}) {
  const headers = {}
  if (session?.token) headers.Authorization = `Bearer ${session.token}`

  let payload
  if (form) {
    payload = form // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  let text
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    })
    text = await response.text() // inside the timer, so a stalled body also times out
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ApiError('The server took too long to answer. Try again in a moment.', 0)
    }
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0)
  } finally {
    clearTimeout(timer)
  }

  let data = null
  const text = await response.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    // A wrong password is a 401 too, but it is not an expired session.
    if (response.status === 401 && path !== '/api/auth/login') {
      writeSession(null)
      if (unauthorizedHandler) unauthorizedHandler()
    }
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, data)
  }
  return data
}

const realApi = {
  currentUser: () => session?.user ?? null,

  // Called when the server rejects the saved token (it expired or was revoked).
  onUnauthorized(handler) {
    unauthorizedHandler = handler
  },

  async login(email, password) {
    const data = await request('POST', '/api/auth/login', { body: { email, password } })
    writeSession({ token: data.token, user: data.user })
    return data.user
  },

  logout() {
    writeSession(null)
  },

  // `as` is for the lead only: the server answers with what that incoming role would see.
  claims: (as) =>
    request('GET', as ? `/api/claims?as=${encodeURIComponent(as)}` : '/api/claims'),
  // `extra` is either the new statement (a string) or an object with optional
  // statement, reason or override.
  review: (id, action, extra) =>
    request('PATCH', `/api/claims/${id}`, {
      body: { action, ...(typeof extra === 'string' ? { statement: extra } : extra) },
    }),
  resolve: (keepId, dropId) => request('POST', '/api/claims/resolve', { body: { keepId, dropId } }),
  resolutions: () => request('GET', '/api/claims/resolutions'),
  answer: (id, answer) => request('POST', `/api/claims/${id}/answer`, { body: { answer } }),

  approval: () => request('GET', '/api/approval'),
  approve: () => request('POST', '/api/approval'),
  revoke: () => request('DELETE', '/api/approval'),
  acknowledge: () => request('POST', '/api/approval/acknowledge'),

  audit: () => request('GET', '/api/audit'),
  // Filtered, paged audit trail (lead only). Returns { rows, nextCursor }.
  auditEvents: (filters, options) =>
    request('GET', `/api/audit/events${buildAuditQuery(filters, options)}`),

  sources: () => request('GET', '/api/sources'),
  uploadSource(file, sensitivity, formality) {
    const form = new FormData()
    form.append('sensitivity', sensitivity) // fields first, the file last
    form.append('formality', formality)
    form.append('file', file)
    return request('POST', '/api/sources', { form })
  },
}

// Local UI work without a server: set VITE_USE_MOCK=true in client/.env.development.local.
// Only the dev server reads that file, so a production build can never run on mock data.
const USE_MOCK = import.meta.env?.DEV === true && import.meta.env?.VITE_USE_MOCK === 'true'

export const api = USE_MOCK ? createMockApi(ApiError) : realApi
