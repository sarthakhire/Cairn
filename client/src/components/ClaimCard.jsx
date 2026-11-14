import { motion, useReducedMotion } from 'motion/react'
import StatusBadge from '@/components/StatusBadge'
import VerificationBadge from '@/components/VerificationBadge'

function ClaimCard({ claim, onSelect, index = 0 }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(claim.id)}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
      className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">
          {claim.type.replace('_', ' ')}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <VerificationBadge verification={claim.verification} />
          <StatusBadge status={claim.status} />
        </span>
      </div>

      <p className="mb-3 text-sm font-medium">{claim.statement}</p>

      {claim.inference && (
        <p className="mb-3 text-xs italic text-amber-400">
          AI inference, not yet confirmed by a person
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Visibility: {claim.visibility}</span>
        <span>
          Review: {claim.review.state}
          {claim.review.edited && ' (human edited)'}
        </span>
      </div>
    </motion.button>
  )
}

export default ClaimCard