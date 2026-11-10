function ApprovalBar({ role, approval, pendingCount, onApprove, onRevoke }) {
  if (role === 'lead') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {approval ? 'Handover approved' : 'Handover not approved yet'}
          </p>
          <p className="text-xs text-muted-foreground">
            {approval
              ? `Approved by ${approval.by}, ${approval.at.replace('T', ' ')}. Incoming roles can see approved claims.`
              : `${pendingCount} claims are still draft. Incoming roles see nothing until you approve.`}
          </p>
        </div>
        {approval ? (
          <button
            type="button"
            onClick={onRevoke}
            className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            Revoke approval
          </button>
        ) : (
          <button
            type="button"
            onClick={onApprove}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Approve handover
          </button>
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
      Approved by {approval.by}, {approval.at.replace('T', ' ')}.
    </p>
  )
}

export default ApprovalBar