import StatusBadge from '@/components/StatusBadge'

const DOT = {
  verified: 'bg-emerald-400',
  uncertain: 'bg-amber-400',
  conflicting: 'bg-red-400',
  missing: 'bg-zinc-400',
}

function formatDate(date) {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function firstDate(claim) {
  const dates = claim.evidence
    .map((item) => item.date)
    .filter(Boolean)
    .sort()
  return dates[0] ?? null
}

function Entry({ claim, date, onSelect }) {
  const evidence = claim.evidence[0]

  return (
    <li className="relative pl-6">
      <span
        className={`absolute -left-[5px] top-2 size-2.5 rounded-full ${
          DOT[claim.status] ?? DOT.missing
        }`}
      />
      <button
        type="button"
        onClick={() => onSelect(claim.id)}
        className="w-full space-y-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60"
      >
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {date ? formatDate(date) : 'No date'} ·{' '}
            <span className="uppercase tracking-wide">
              {claim.type.replace('_', ' ')}
            </span>
          </span>
          <StatusBadge status={claim.status} />
        </div>
        <p className="text-sm font-medium">{claim.statement}</p>
        {evidence && (
          <p className="text-xs text-muted-foreground">{evidence.source}</p>
        )}
        {claim.status === 'conflicting' && (
          <p className="text-xs text-red-400">
            Another source disagrees with this claim.
          </p>
        )}
      </button>
    </li>
  )
}

function Timeline({ claims, onSelect }) {
  const dated = claims
    .map((claim) => ({ claim, date: firstDate(claim) }))
    .filter((item) => item.date)
    .sort((a, b) => a.date.localeCompare(b.date))

  const undated = claims.filter((claim) => !firstDate(claim))

  if (claims.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nothing to show on the timeline yet.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Oldest first. Each entry is dated by its earliest source.
      </p>

      {dated.length > 0 && (
        <ol className="ml-1 space-y-4 border-l">
          {dated.map(({ claim, date }) => (
            <Entry key={claim.id} claim={claim} date={date} onSelect={onSelect} />
          ))}
        </ol>
      )}

      {undated.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
            No date in sources
          </h3>
          <ol className="ml-1 space-y-4 border-l">
            {undated.map((claim) => (
              <Entry key={claim.id} claim={claim} date={null} onSelect={onSelect} />
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

export default Timeline
