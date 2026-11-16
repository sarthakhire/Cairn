import test from 'node:test';
import assert from 'node:assert/strict';
import { pingHealth, waitForServer } from '../src/lib/wakeup.js';

const ok = async () => ({ ok: true });
const down = async () => {
  throw new TypeError('network');
};
const noSleep = async () => {};

test('pingHealth is true on 200', async () => {
  assert.equal(await pingHealth('http://x', { fetchFn: ok }), true);
});

test('pingHealth is false on 503 and on network error', async () => {
  assert.equal(await pingHealth('http://x', { fetchFn: async () => ({ ok: false }) }), false);
  assert.equal(await pingHealth('http://x', { fetchFn: down }), false);
});

test('pingHealth strips a trailing slash', async () => {
  let url = '';
  await pingHealth('http://x/', { fetchFn: async (u) => ((url = u), { ok: true }) });
  assert.equal(url, 'http://x/api/health');
});

test('waitForServer retries until the server answers', async () => {
  let calls = 0;
  const attempts = [];
  const fetchFn = async () => {
    calls += 1;
    if (calls < 3) throw new TypeError('asleep');
    return { ok: true };
  };
  const up = await waitForServer('http://x', {
    fetchFn,
    sleep: noSleep,
    onAttempt: (n) => attempts.push(n),
  });
  assert.equal(up, true);
  assert.equal(calls, 3);
  assert.deepEqual(attempts, [1, 2]);
});

test('waitForServer gives up after maxAttempts', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    throw new TypeError('asleep');
  };
  const up = await waitForServer('http://x', { fetchFn, sleep: noSleep, maxAttempts: 4 });
  assert.equal(up, false);
  assert.equal(calls, 4);
});

test('waitForServer stops when aborted', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  let calls = 0;
  const up = await waitForServer('http://x', {
    fetchFn: async () => ((calls += 1), { ok: true }),
    signal: ctrl.signal,
  });
  assert.equal(up, false);
  assert.equal(calls, 0);
});