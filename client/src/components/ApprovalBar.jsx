const KIND_LABEL = { draft: 'Draft', mismatch: 'Quote mismatch' }

function short(text) {
  return text.length > 90 ? `${text.slice(0, 90)}...` : text
}

function warningText(warnings) {
  if (!warnings) return ''
  const parts = [
    [warnings.partial, 'partial match'],
    [warnings.uncertain, 'uncertain'],
    [warnings.missing, 'missing'],
    [warnings.conflicting, 'conflicting'],
  ]
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
  return parts.join(', ')
}

function ApprovalBar({
  role,
  approval,
  pendingCount,
  changedCount,
  nextVersion,
  onApprove,
  onRevoke,
  issue = { message: '', blockers: [] },
  warnings = null,
  claims = [],
  busy = false,
  onSelectClaim = () => {},
}) {
  if (role === 'lead') {
    const blockers = issue.blockers ?? []
    const blocked = blockers.length > 0
    const warned = warningText(warnings)

    return (
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {approval
                ? `Handover v${approval.version} approved`
                : 'Handover not approved yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              {approval
                ? `Approved by ${approval.by}, ${approval.at.replace('T', ' ')}. Incoming roles see this version.`
                : `${pendingCount} claims are still draft. Incoming roles see nothing until you approve.`}
            </p>
          </div>

          <div className="flex gap-2">
            {(!approval || changedCount > 0) && (
              <button
                type="button"
                onClick={onApprove}
                disabled={blocked || busy}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {approval ? `Approve as v${nextVersion}` : 'Approve handover'}
              </button>
            )}
            {approval && (
              <button
                type="button"
                onClick={onRevoke}
                disabled={busy}
                className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                Revoke approval
              </button>
            )}
          </div>
        </div>

        {approval && changedCount > 0 && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
            {changedCount} {changedCount === 1 ? 'claim has' : 'claims have'} changed
            since v{approval.version}. Incoming roles still see v{approval.version}{' '}
            until you approve again.
          </p>
        )}

        {blocked && (
          <div
            role="alert"
            className="space-y-2 rounded-md border border-red-500/30 bg-red-500/10 p-3"
          >
            <p className="text-xs font-medium text-red-400">{issue.message}</p>
            <p className="text-xs text-muted-foreground">
              Open each item and accept, edit or reject it. Approve unlocks once the
              list is clear.
            </p>
            <ul className="space-y-1.5">
              {blockers.map((item) => {
                const claim = claims.find((c) => c.id === item.id)
                return (
                  <li key={`${item.id}-${item.kind}`}>
                    <button
                      type="button"
                      onClick={() => onSelectClaim(item.id)}
                      className="w-full rounded-md border border-red-500/20 px-3 py-2 text-left text-xs transition-colors hover:bg-red-500/10"
                    >
                      <span className="font-medium">
                        {KIND_LABEL[item.kind] ?? item.kind}
                      </span>{' '}
                      <span className="text-muted-foreground">{item.id}</span>
                      <span className="block">{item.message}</span>
                      {claim && (
                        <span className="block text-muted-foreground">
                          {short(claim.statement)}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {!blocked && issue.message && (
          <p
            role="status"
            className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400"
          >
            {issue.message}
          </p>
        )}

        {warned && (
          <p className="text-xs text-muted-foreground">
            Warnings that do not block approval: {warned}.
          </p>
        )}
      </div>
    )
  }

  if (!approval) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">This handover has not been approved yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing is shared until a reviewer has accepted, corrected or rejected
          every claim and approved the handover.
        </p>
      </div>
    )
  }

  return (
    <p className="text-xs text-muted-foreground">
      Handover v{approval.version}, approved by {approval.by},{' '}
      {approval.at.replace('T', ' ')}.
    </p>
  )
}

export default ApprovalBar