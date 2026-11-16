import { useState } from 'react'
import { useEffect } from 'react'
import { waitForServer } from '@/lib/wakeup'
import { API_BASE } from '@/lib/api'
import { Button } from '@/components/ui/button'

// Shown before sign-in until /api/health answers. Free hosting sleeps after
// 15 minutes, so the first request can take up to a minute.
function WakeUp({ onReady }) {
  const [failed, setFailed] = useState(0)
  const [gaveUp, setGaveUp] = useState(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    waitForServer(API_BASE, { signal: ctrl.signal, onAttempt: setFailed }).then((up) => {
      if (ctrl.signal.aborted) return
      if (up) onReady(true)
      else setGaveUp(true)
    })
    return () => ctrl.abort()
  }, [round, onReady])

  function retry() {
    setFailed(0)
    setGaveUp(false)
    setRound((r) => r + 1)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div role="status" className="max-w-md rounded-lg border p-6 text-center">
        {gaveUp ? (
          <>
            <h1 className="text-lg font-semibold">The server did not answer</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              It may be down or your connection may be offline. Try again in a moment.
            </p>
            <Button className="mt-4" onClick={retry}>
              Try again
            </Button>
          </>
        ) : failed === 0 ? (
          <p className="text-sm text-muted-foreground">Connecting to the server...</p>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Waking the server</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Free hosting can take up to a minute. This page continues by itself.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Attempt {failed + 1}</p>
          </>
        )}
      </div>
    </div>
  )
}

export default WakeUp