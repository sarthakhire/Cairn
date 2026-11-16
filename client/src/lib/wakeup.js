// Waits for the server to wake up (Render free tier sleeps after 15 min).
// Pure helper: fetch and sleep can be injected so it is testable.

const defaultSleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
  });

export async function pingHealth(baseUrl, { fetchFn = fetch, timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${baseUrl.replace(/\/+$/, '')}/api/health`, {
      signal: ctrl.signal,
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Returns true when /api/health answers 200, false after maxAttempts or abort.
// 60 attempts x 3 s = 3 minutes.
export async function waitForServer(
  baseUrl,
  {
    fetchFn = fetch,
    intervalMs = 3000,
    maxAttempts = 60,
    timeoutMs = 8000,
    signal,
    onAttempt,
    sleep = defaultSleep,
  } = {}
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) return false;
    if (await pingHealth(baseUrl, { fetchFn, timeoutMs })) return true;
    onAttempt?.(attempt);
    if (attempt < maxAttempts) await sleep(intervalMs, signal);
  }
  return false;
}