import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/StatusBadge'
import VerificationBadge from '@/components/VerificationBadge'
import { diffWords, stripEdgeEllipsis } from '@/lib/diff'

const MIN_REASON = 10
const MAX_REASON = 500

// Changed words are underlined as well as coloured, so colour is never the only cue.
function Words({ words }) {
  return (
    <>
      {words.map((word, index) => (
        <span key={index}>
          {word.changed ? (
            <mark className="rounded bg-amber-500/25 px-0.5 text-amber-300 underline decoration-amber-400 underline-offset-2">
              {word.text}
            </mark>
          ) : (
            word.text
          )}{' '}
        </span>
      ))}
    </>
  )
}

function EvidenceItem({ item, canReview }) {
  const match = item.match
  const closest = match?.closest ?? null
  const diff = closest ? diffWords(stripEdgeEllipsis(item.quote), closest) : null
  const score = typeof match?.score === 'number' ? `${Math.round(match.score * 100)}%` : null

  return (
    <div className="space-y-3 rounded-md border-l-2 border-primary bg-muted p-3">
      {match && (
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge verification={match.result} />
          {score && (
            <span className="text-xs text-muted-foreground">Similarity {score}</span>
          )}
          {match.reason && (
            <span className="text-xs text-muted-foreground">{match.reason}</span>
          )}
        </div>
      )}

      {diff ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Claimed quote
            </p>
            <p className="font-serif text-base italic leading-snug">
              <Words words={diff.left} />
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Closest passage in the source
            </p>
            <p className="font-serif text-base leading-snug">
              <Words words={diff.right} />
            </p>
          </div>
        </div>
      ) : (
        <p className="font-serif text-lg italic">{item.quote}</p>
      )}

      {match && !closest && (
        <p className="text-xs text-muted-foreground">
          {canReview
            ? 'No close passage was found in the cited chunk.'
            : 'The closest source passage is shown to the reviewer only.'}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {item.source}, chunk {item.chunk}, {item.date}
      </p>
    </div>
  )
}

function ReasonField({ id, label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={MAX_REASON}
        className="w-full rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <p className="text-xs text-muted-foreground">
        {MIN_REASON} to {MAX_REASON} characters ({value.trim().length}/{MAX_REASON})
      </p>
    </div>
  )
}

function ReviewSection({ claim, onReview, onEdit, canReview, error }) {
  const [mode, setMode] = useState('idle')
  const [draft, setDraft] = useState(claim.statement)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const review = claim.review
  const mismatch = claim.verification === 'mismatch'
  const canEdit = claim.visibility !== 'restricted'

  const summary = (
    <>
      <p className="text-sm">
        {review.state}
        {review.by && ` by ${review.by}`}
        {review.at && `, ${review.at.replace('T', ' ')}`}
      </p>
      {canReview && review.reason && (
        <p className="text-xs text-muted-foreground">Reason: {review.reason}</p>
      )}
      {canReview && review.override?.reason && (
        <p className="text-xs text-amber-400">
          Accepted despite a quote mismatch: {review.override.reason}
        </p>
      )}
    </>
  )

  if (!canReview) {
    return (
      <section className="space-y-1">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          Review
        </h3>
        {summary}
      </section>
    )
  }

  const reasonOk = reason.trim().length >= MIN_REASON
  const text = draft.trim()
  const editOk = text.length > 0 && text !== claim.statement && (!mismatch || reasonOk)

  async function run(task) {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      const ok = await task()
      if (ok) {
        setMode('idle')
        setReason('')
      } else {
        setFailed(true)
      }
    } finally {
      setPending(false)
    }
  }

  function cancel() {
    setMode('idle')
    setReason('')
    setDraft(claim.statement)
    setFailed(false)
  }

  function startAccept() {
    if (mismatch) setMode('accept')
    else run(() => onReview(claim.id, 'accept'))
  }

  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
        Review
      </h3>
      <div className="space-y-1">{summary}</div>

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={startAccept}>
            Accept
          </Button>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setMode('edit')}
            >
              Edit
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => setMode('reject')}
          >
            Reject
          </Button>
        </div>
      )}

      {mode === 'accept' && (
        <div className="space-y-2 rounded-md border border-amber-500/30 p-3">
          <p className="text-xs text-amber-400">
            The quote does not match the source. Accepting it needs a reason.
          </p>
          <ReasonField
            id="override-reason"
            label="Why accept this claim anyway?"
            value={reason}
            onChange={setReason}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!reasonOk || pending}
              onClick={() =>
                run(() => onReview(claim.id, 'accept', { override: reason.trim() }))
              }
            >
              Accept anyway
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'reject' && (
        <div className="space-y-2 rounded-md border border-red-500/30 p-3">
          <ReasonField
            id="reject-reason"
            label="Why is this claim rejected?"
            value={reason}
            onChange={setReason}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={!reasonOk || pending}
              onClick={() =>
                run(() => onReview(claim.id, 'reject', { reason: reason.trim() }))
              }
            >
              Reject claim
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-2">
          <label htmlFor="edit-statement" className="block text-xs text-muted-foreground">
            Edit the claim statement
          </label>
          <textarea
            id="edit-statement"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            className="w-full rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {mismatch && (
            <ReasonField
              id="edit-override"
              label="The quote does not match the source. Why keep this claim?"
              value={reason}
              onChange={setReason}
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!editOk || pending}
              onClick={() =>
                run(() =>
                  onEdit(claim.id, text, mismatch ? { override: reason.trim() } : undefined)
                )
              }
            >
              Save
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {failed && error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}

function EvidenceDrawer({ claim, allClaims, onClose, onReview, onEdit, canReview, error = '' }) {
  const conflicts = claim
    ? allClaims.filter((c) => (claim.conflictsWith ?? []).includes(c.id))
    : []

  return (
    <Sheet open={claim !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        {claim && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={claim.status} />
                <VerificationBadge verification={claim.verification} />
                {claim.review?.edited && (
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-400">
                    Human edited
                  </span>
                )}
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {claim.type.replace('_', ' ')}
                </span>
              </div>
              <SheetTitle className="text-base">{claim.statement}</SheetTitle>
              <SheetDescription>
                Visibility: {claim.visibility}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <section className="space-y-2">
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                  Evidence
                </h3>
                {claim.evidence.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No source evidence for this claim.
                  </p>
                ) : (
                  claim.evidence.map((item, index) => (
                    <EvidenceItem key={index} item={item} canReview={canReview} />
                  ))
                )}
              </section>

              {conflicts.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs uppercase tracking-wide text-red-400">
                    Conflicts with
                  </h3>
                  {conflicts.map((other) => (
                    <div
                      key={other.id}
                      className="space-y-1 rounded-md border border-red-500/30 p-3"
                    >
                      <p className="text-sm font-medium">{other.statement}</p>
                      {other.evidence[0] && (
                        <p className="text-xs text-muted-foreground">
                          {other.evidence[0].source}, {other.evidence[0].date}
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {claim.nextAction && (
                <section className="space-y-1">
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                    Next action
                  </h3>
                  <p className="text-sm">{claim.nextAction}</p>
                </section>
              )}

              <ReviewSection
                key={claim.id}
                claim={claim}
                onReview={onReview}
                onEdit={onEdit}
                canReview={canReview}
                error={error}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default EvidenceDrawer