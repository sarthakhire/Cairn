import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { actionLabel, stateChange } from '@/lib/history'

// Lead only. The server never sends these fields to incoming roles, and the
// drawer does not render this panel for them either.
function HistoryPanel({ review, error = '', onUndo }) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const entries = Array.isArray(review?.history) ? review.history : []
  const canUndo = Boolean(onUndo) && review?.state && review.state !== 'draft'

  async function undo() {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      const ok = await onUndo()
      if (!ok) setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          Review history
        </h3>
        {canUndo && (
          <Button size="sm" variant="outline" disabled={pending} onClick={undo}>
            Undo (reopen as draft)
          </Button>
        )}
      </div>

      {review?.originalStatement && (
        <div className="space-y-1 rounded-md border bg-muted p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Original wording
          </p>
          <p className="text-sm">{review.originalStatement}</p>
        </div>
      )}

      {review?.override?.reason && (
        <div className="space-y-1 rounded-md border border-amber-500/30 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-400">
            Accepted despite a quote mismatch
          </p>
          <p className="text-sm">{review.override.reason}</p>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No review actions recorded yet.
        </p>
      ) : (
        <ol className="space-y-3 border-l pl-4">
          {entries.map((entry, index) => (
            <li key={`${entry.at ?? 'no-time'}-${index}`} className="space-y-1 text-sm">
              <p>
                <span className="font-medium">{actionLabel(entry.action)}</span>{' '}
                <span className="text-xs text-muted-foreground">{stateChange(entry)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {entry.by ?? 'Unknown'}
                {entry.at && `, ${String(entry.at).replace('T', ' ')}`}
              </p>
              {entry.fromStatement && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Before: </span>
                  {entry.fromStatement}
                </p>
              )}
              {entry.toStatement && (
                <p className="text-xs">
                  <span className="text-muted-foreground">After: </span>
                  {entry.toStatement}
                </p>
              )}
              {entry.reason && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Reason: </span>
                  {entry.reason}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {failed && error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}

export default HistoryPanel