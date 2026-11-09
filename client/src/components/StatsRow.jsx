function Stat({ label, value, tone = '' }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className={`text-3xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  )
}

function StatsRow({ claims }) {
  const total = claims.length
  const verified = claims.filter((claim) => claim.status === 'verified').length
  const conflicts = claims.filter((claim) => claim.status === 'conflicting').length
  const missing = claims.filter((claim) => claim.status === 'missing').length
  const verifiedPercent = total === 0 ? 0 : Math.round((verified / total) * 100)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Claims" value={total} />
      <Stat label="Verified" value={`${verifiedPercent}%`} tone="text-emerald-400" />
      <Stat
        label="Conflicts"
        value={conflicts}
        tone={conflicts > 0 ? 'text-red-400' : ''}
      />
      <Stat
        label="Missing"
        value={missing}
        tone={missing > 0 ? 'text-amber-400' : ''}
      />
    </div>
  )
}

export default StatsRow
