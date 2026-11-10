import { ROLES } from '@/lib/roles'

const INCOMING = ROLES.filter((item) => item.value !== 'lead')

function AcknowledgeBar({ role, approval, acknowledgements, onAcknowledge }) {
  if (!approval) return null

  if (role === 'lead') {
    return (
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Receipt
        </p>
        <ul className="space-y-1">
          {INCOMING.map((item) => {
            const record = acknowledgements[item.value]
            return (
              <li
                key={item.value}
                className="flex items-center justify-between text-sm"
              >
                <span>{item.label}</span>
                {record ? (
                  <span className="text-emerald-400">
                    Acknowledged, {record.at.replace('T', ' ')}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not read yet</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const record = acknowledgements[role]

  if (record) {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
        You acknowledged this handover on {record.at.replace('T', ' ')}.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        Once you have read the handover, confirm receipt so the reviewer knows.
      </p>
      <button
        type="button"
        onClick={() => onAcknowledge(role)}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        I have read this handover
      </button>
    </div>
  )
}

export default AcknowledgeBar
