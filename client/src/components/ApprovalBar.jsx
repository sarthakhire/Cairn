function ApprovalBar({
  role,
  approval,
  pendingCount,
  changedCount,
  nextVersion,
  onApprove,
  onRevoke,
}) {
  if (role === 'lead') {
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
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {approval ? `Approve as v${nextVersion}` : 'Approve handover'}
              </button>
            )}
            {approval && (
              <button
                type="button"
                onClick={onRevoke}
                className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
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