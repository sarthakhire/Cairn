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

function ReviewSection({ claim, onReview, onEdit, canReview }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(claim.statement)
  const canEdit = claim.visibility !== 'restricted'

  if (!canReview) {
    return (
      <section className="space-y-1">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          Review
        </h3>
        <p className="text-sm">
          {claim.review.state}
          {claim.review.by && ` by ${claim.review.by}`}
          {claim.review.at && `, ${claim.review.at.replace('T', ' ')}`}
        </p>
      </section>
    )
  }

  function save() {
    const text = draft.trim()
    if (!text) return
    if (text === claim.statement) {
      setEditing(false)
      return
    }
    onEdit(claim.id, text)
    setEditing(false)
  }

  function cancel() {
    setDraft(claim.statement)
    setEditing(false)
  }

  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
        Review
      </h3>
      <p className="text-sm">
        {claim.review.state}
        {claim.review.by && ` by ${claim.review.by}`}
        {claim.review.at && `, ${claim.review.at.replace('T', ' ')}`}
      </p>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            aria-label="Edit claim statement"
            className="w-full rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onReview(claim.id, 'accepted')}>
            Accept
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onReview(claim.id, 'rejected')}
          >
            Reject
          </Button>
        </div>
      )}
    </section>
  )
}

function EvidenceDrawer({ claim, allClaims, onClose, onReview, onEdit, canReview }) {
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
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default EvidenceDrawer