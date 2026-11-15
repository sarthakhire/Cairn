import { useState } from 'react'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/StatusBadge'
import VerificationBadge from '@/components/VerificationBadge'
import {
  DEFAULT_FILTERS,
  STATE_OPTIONS,
  TYPE_OPTIONS,
  VERIFICATION_OPTIONS,
  countFor,
  filterQueue,
  sortQueue,
} from '@/lib/queue'

function ChipRow({ title, group, options, claims, filters, onPick }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div role="group" aria-label={`Filter by ${title.toLowerCase()}`} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = filters[group] === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onPick(group, option.value)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {option.label} ({countFor(claims, filters, group, option.value)})
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Row({ claim, busy, onOpen, onReview }) {
  const state = claim.review?.state ?? 'draft'
  const mismatch = claim.verification === 'mismatch'
  const approved = state === 'accepted' || state === 'edited'
  const canEdit = claim.visibility !== 'restricted'
  const source = claim.evidence?.[0]

  return (
    <li className="space-y-3 rounded-lg border bg-card p-4">
      <button
        type="button"
        onClick={() => onOpen(claim.id)}
        className="block w-full space-y-2 text-left"
      >
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase tracking-wide">{claim.type.replace('_', ' ')}</span>
          <VerificationBadge verification={claim.verification} />
          <StatusBadge status={claim.status} />
        </span>
        <span className="block text-sm font-medium">{claim.statement}</span>
        <span className="block text-xs text-muted-foreground">
          {source ? `${source.source}, chunk ${source.chunk}` : 'No source quote'}
          {' | '}Review: {state}
          {claim.review?.edited && ' (human edited)'}
        </span>
        {claim.review?.reason && (
          <span className="block text-xs text-muted-foreground">
            Reason: {claim.review.reason}
          </span>
        )}
      </button>

      <div className="flex flex-wrap gap-2">
        {!approved && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              mismatch ? onOpen(claim.id, 'accept') : onReview(claim.id, 'accept')
            }
          >
            {mismatch ? 'Accept...' : 'Accept'}
          </Button>
        )}
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onOpen(claim.id, 'edit')}
          >
            Edit
          </Button>
        )}
        {state !== 'rejected' && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => onOpen(claim.id, 'reject')}
          >
            Reject
          </Button>
        )}
      </div>
    </li>
  )
}

function ReviewQueue({ claims, busy = false, onOpen, onReview }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  const shown = sortQueue(filterQueue(claims, filters))

  function pick(group, value) {
    setFilters((current) => ({ ...current, [group]: value }))
  }

  const nothingToReview = shown.length === 0 && filters.state === 'draft' &&
    filters.verification === 'all' && filters.type === 'all'

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Claims that still need a decision are listed first, quote mismatches at the
        top. Accept, edit or reject here, or open a claim to read its evidence.
      </p>

      <ChipRow title="State" group="state" options={STATE_OPTIONS} claims={claims} filters={filters} onPick={pick} />
      <ChipRow title="Evidence check" group="verification" options={VERIFICATION_OPTIONS} claims={claims} filters={filters} onPick={pick} />
      <ChipRow title="Type" group="type" options={TYPE_OPTIONS} claims={claims} filters={filters} onPick={pick} />

      <p className="text-xs text-muted-foreground">
        Showing {shown.length} of {claims.length} claims
      </p>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {nothingToReview
            ? 'Nothing to review. Every claim has a decision.'
            : 'No claims match these filters.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((claim) => (
            <Row
              key={claim.id}
              claim={claim}
              busy={busy}
              onOpen={onOpen}
              onReview={onReview}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export default ReviewQueue