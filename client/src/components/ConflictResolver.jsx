import StatusBadge from '@/components/StatusBadge'

function findConflictPairs(claims) {
  const seen = new Set()
  const pairs = []

  for (const claim of claims) {
    if (claim.status !== 'conflicting') continue
    for (const otherId of claim.conflictsWith) {
      const other = claims.find((item) => item.id === otherId)
      if (!other || other.status !== 'conflicting') continue
      const key = [claim.id, other.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push([claim, other])
    }
  }

  return pairs
}

function Side({ claim, otherId, onResolve }) {
  const evidence = claim.evidence[0]

  return (
    <div className="flex flex-col justify-between space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-3">
        <StatusBadge status={claim.status} />
        <p className="text-sm font-medium">{claim.statement}</p>
        {evidence ? (
          <blockquote className="space-y-2 rounded-md border-l-2 border-primary bg-muted p-3">
            <p className="font-serif text-lg italic">{evidence.quote}</p>
            <p className="text-xs text-muted-foreground">
              {evidence.source}, chunk {evidence.chunk}, {evidence.date}
            </p>
          </blockquote>
        ) : (
          <p className="text-sm text-muted-foreground">No source evidence.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onResolve(claim.id, otherId)}
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Keep this one
      </button>
    </div>
  )
}

function ConflictResolver({ claims, resolutions, onResolve }) {
  const pairs = findConflictPairs(claims)

  return (
    <div className="space-y-6">
      {pairs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {resolutions.length > 0
            ? 'All conflicts are resolved.'
            : 'No conflicts found in these sources.'}
        </p>
      ) : (
        pairs.map(([first, second]) => (
          <section key={`${first.id}-${second.id}`} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Two sources disagree. Pick the one that is correct, and the choice
              will be logged.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Side claim={first} otherId={second.id} onResolve={onResolve} />
              <Side claim={second} otherId={first.id} onResolve={onResolve} />
            </div>
          </section>
        ))
      )}

      {resolutions.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
            Resolution log
          </h3>
          <ul className="space-y-2">
            {resolutions.map((item, index) => (
              <li key={index} className="rounded-md border p-3 text-sm">
                <p>
                  <span className="text-emerald-400">Kept:</span>{' '}
                  {item.keepStatement}
                </p>
                <p className="text-muted-foreground">
                  <span className="text-red-400">Set aside:</span>{' '}
                  {item.dropStatement}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.by}, {item.at.replace('T', ' ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default ConflictResolver