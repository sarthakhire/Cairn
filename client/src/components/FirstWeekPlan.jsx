import StatusBadge from '@/components/StatusBadge'
import { buildPlan } from '@/lib/plan'

function FirstWeekPlan({ claims, onSelect }) {
  const plan = buildPlan(claims)

  if (plan.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No actions in this handover yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Risks first, then the least certain items. Each action links to the claim behind it.
      </p>
      <ol className="space-y-3">
        {plan.map((claim, index) => (
          <li key={claim.id}>
            <button
              type="button"
              onClick={() => onSelect(claim.id)}
              className="flex w-full items-start gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60"
            >
              <span className="font-serif text-3xl italic text-primary">
                {index + 1}
              </span>
              <span className="flex-1 space-y-1">
                <span className="block text-sm font-medium">{claim.nextAction}</span>
                <span className="block text-xs text-muted-foreground">
                  Because: {claim.statement}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {claim.evidence[0]
                    ? `${claim.evidence[0].source}, ${claim.evidence[0].date}`
                    : 'No source evidence yet'}
                </span>
              </span>
              <StatusBadge status={claim.status} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default FirstWeekPlan