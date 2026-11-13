// The API layer with a fake fetch and a fake sessionStorage. Run with: npm test
import test from 'node:test'
import assert from 'node:assert/strict'

let counter = 0
function setup(replies = []) {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    const next = replies.shift()
    if (next instanceof Error) throw next
    return {
      ok: next.status < 400,
      status: next.status,
      text: async () => (next.body === undefined ? '' : typeof next.body === 'string' ? next.body : JSON.stringify(next.body)),
    }
  }
  return { store, calls }
}
const load = async () => (await import(`../src/lib/api.js?case=${counter++}`))

test('login stores the session and later calls carry the token', async () => {
  const { store, calls } = setup([
    { status: 200, body: { token: 'tok123', user: { id: 'u1', name: 'Demo Lead', role: 'lead' } } },
    { status: 200, body: [] },
  ])
  const { api } = await load()
  const user = await api.login('lead@demo.test', 'demo1234')
  assert.equal(user.role, 'lead')
  assert.equal(api.currentUser().name, 'Demo Lead')
  assert.ok(store.get('handovertrail.session').includes('tok123'))

  await api.claims()
  assert.equal(calls[0].url, 'http://localhost:5000/api/auth/login')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.Authorization, undefined) // no token before login
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: 'lead@demo.test', password: 'demo1234' })
  assert.equal(calls[1].url, 'http://localhost:5000/api/claims')
  assert.equal(calls[1].init.headers.Authorization, 'Bearer tok123')
})

test('a saved session is restored after a page refresh', async () => {
  setup()
  sessionStorage.setItem('handovertrail.session', JSON.stringify({ token: 't', user: { role: 'incoming_lead' } }))
  const { api } = await load()
  assert.equal(api.currentUser().role, 'incoming_lead')
})

test('a damaged saved session is ignored, not fatal', async () => {
  setup()
  sessionStorage.setItem('handovertrail.session', '{not json')
  const { api } = await load()
  assert.equal(api.currentUser(), null)
})

test('a wrong password is an error with the server message and does not look like an expired session', async () => {
  setup([{ status: 401, body: { error: 'Invalid email or password' } }])
  const { api, ApiError } = await load()
  let fired = 0
  api.onUnauthorized(() => { fired += 1 })
  await assert.rejects(() => api.login('a@b.co', 'nope'), (e) => e instanceof ApiError && e.status === 401 && e.message === 'Invalid email or password')
  assert.equal(fired, 0)
  assert.equal(api.currentUser(), null)
})

test('a 401 on any other call clears the session and tells the app', async () => {
  const { store } = setup([
    { status: 200, body: { token: 't', user: { role: 'lead' } } },
    { status: 401, body: { error: 'Login required' } },
  ])
  const { api } = await load()
  let fired = 0
  api.onUnauthorized(() => { fired += 1 })
  await api.login('x@y.co', 'pw')
  await assert.rejects(() => api.claims(), { status: 401 })
  assert.equal(fired, 1)
  assert.equal(api.currentUser(), null)
  assert.equal(store.has('handovertrail.session'), false)
})

test('server errors show the server message; odd replies get a generic one', async () => {
  setup([
    { status: 409, body: { error: 'Nothing is approved' } },
    { status: 500, body: '<html>oops</html>' },
  ])
  const { api } = await load()
  await assert.rejects(() => api.revoke(), { status: 409, message: 'Nothing is approved' })
  await assert.rejects(() => api.approve(), { status: 500, message: 'Request failed (500)' })
})

test('no connection gives a readable error with status 0', async () => {
  setup([new TypeError('fetch failed')])
  const { api } = await load()
  await assert.rejects(() => api.claims(), (e) => e.status === 0 && /Cannot reach the server/.test(e.message))
})

test('each call uses the route and body the server expects', async () => {
  const { calls } = setup(Array.from({ length: 12 }, () => ({ status: 200, body: {} })))
  const { api } = await load()
  await api.review('c_001', 'accept')
  await api.review('c_001', 'edit', 'New text')
  await api.resolve('c_042', 'c_043')
  await api.answer('c_044', 'Meera')
  await api.approve()
  await api.revoke()
  await api.acknowledge()
  await api.approval()
  await api.audit()
  await api.sources()
  await api.resolutions()
  const seen = calls.map((c) => `${c.init.method} ${c.url.replace('http://localhost:5000', '')}`)
  assert.deepEqual(seen, [
    'PATCH /api/claims/c_001', 'PATCH /api/claims/c_001', 'POST /api/claims/resolve',
    'POST /api/claims/c_044/answer', 'POST /api/approval', 'DELETE /api/approval',
    'POST /api/approval/acknowledge', 'GET /api/approval', 'GET /api/audit',
    'GET /api/sources', 'GET /api/claims/resolutions',
  ])
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'accept' })
  assert.deepEqual(JSON.parse(calls[1].init.body), { action: 'edit', statement: 'New text' })
  assert.deepEqual(JSON.parse(calls[2].init.body), { keepId: 'c_042', dropId: 'c_043' })
  assert.deepEqual(JSON.parse(calls[3].init.body), { answer: 'Meera' })
  assert.equal(calls[4].init.body, undefined)
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json')
})

test('a source upload is multipart with the file last and no hand-set content type', async () => {
  const { calls } = setup([{ status: 201, body: { chunkCount: 3 } }])
  const { api } = await load()
  const file = new File(['# Notes'], 'notes.md', { type: 'text/markdown' })
  const result = await api.uploadSource(file, 'team', 'formal')
  assert.equal(result.chunkCount, 3)
  const { init } = calls[0]
  assert.equal(init.method, 'POST')
  assert.ok(init.body instanceof FormData)
  assert.equal(init.headers['Content-Type'], undefined)
  assert.deepEqual([...init.body.keys()], ['sensitivity', 'formality', 'file'])
  assert.equal(init.body.get('file').name, 'notes.md')
})
