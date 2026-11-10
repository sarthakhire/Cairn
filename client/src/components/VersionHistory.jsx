import { useState } from 'react'
import StatusBadge from '@/components/StatusBadge'

function VersionHistory({ versions, currentVersion }) {
  const [openNumber, setOpenNumber] = useState(null)

  if (versions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No versions yet. Each time you approve the handover, a version is saved here.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Every approval is saved as a version and never changed afterwards. Incoming
        roles see the version that is currently approved.
      </p>
      <ul className="space-y-3">
        {[...versions].reverse().map((version) => {
          const open = openNumber === version.number
          const { summary } = version
          return (
            <li key={version.number} className="rounded-lg border bg-card">
              <button
                type="button"
                onClick={() => setOpenNumber(open ? null : version.number)}
                aria-expanded={open}
                className="flex w-full items-start justify-between gap-3 p-4 text-left"
              >
                <span className="space-y-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    Version {version.number}
                    {currentVersion === version.number && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                        Shared now
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Approved by {version.by}, {version.at.replace('T', ' ')}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {summary.total} claims, {summary.verified} verified,{' '}
                    {summary.conflicts} conflicts, {summary.missing} missing,{' '}
                    {summary.draft} still draft
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {open ? 'Hide claims' : 'View claims'}
                </span>
              </button>

              {open && (
                <ul className="space-y-2 border-t p-4">
                  {version.claims.map((claim) => (
                    <li
                      key={claim.id}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <span className="space-y-0.5">
                        <span className="block">{claim.statement}</span>
                        <span className="block text-xs text-muted-foreground">
                          Review: {claim.review.state}
                        </span>
                      </span>
                      <StatusBadge status={claim.status} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default VersionHistory