const TONE = {
  Accepted: 'text-emerald-400',
  Edited: 'text-sky-400',
  Rejected: 'text-red-400',
  'Conflict resolved': 'text-amber-400',
  'Handover approved': 'text-emerald-400',
  'Approval revoked': 'text-red-400',
  Acknowledged: 'text-primary',
  'Gap answered': 'text-sky-400',
  'Source imported': 'text-primary',
  'Extraction run': 'text-primary',
}

function AuditLog({ entries }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No actions yet. Accept, edit, reject or approve something and it will
        appear here.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Every review action is recorded here, newest first.
      </p>
      <ul className="space-y-2">
        {entries.map((entry, index) => (
          <li key={index} className="space-y-1 rounded-md border bg-card p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className={`font-medium ${TONE[entry.action] ?? ''}`}>
                {entry.action}
              </span>
              <span className="text-xs text-muted-foreground">
                {entry.at.replace('T', ' ')}
              </span>
            </div>
            {entry.detail && <p className="text-sm">{entry.detail}</p>}
            <p className="text-xs text-muted-foreground">By {entry.actor}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default AuditLog