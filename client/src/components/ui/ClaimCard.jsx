import StatusBadge from '@/components/StatusBadge'

function ClaimCard({ claim }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">
          {claim.type.replace('_', ' ')}
        </span>
        <StatusBadge status={claim.status} />
      </div>

      <p className="mb-3 text-sm font-medium">{claim.statement}</p>

      {claim.inference && (
        <p className="mb-3 text-xs italic text-amber-400">
          AI inference, not yet confirmed by a person
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Visibility: {claim.visibility}</span>
        <span>Review: {claim.review.state}</span>
      </div>
    </div>
  )
}

export default ClaimCard