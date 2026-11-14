const STYLES = {
  verified: {
    label: 'Quote verified',
    hint: 'The quote was found in the cited source and supports the claim.',
    classes: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  },
  partial: {
    label: 'Partial match',
    hint: 'Close to the source but not an exact match. A person should check it.',
    classes: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  },
  mismatch: {
    label: 'Quote mismatch',
    hint: 'The quote does not match the cited source.',
    classes: 'border-red-500/30 bg-red-500/15 text-red-400',
  },
  none: {
    label: 'No source quote',
    hint: 'This claim has no quote from a source to check.',
    classes: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-400',
  },
}

function VerificationBadge({ verification, className = '' }) {
  const style = STYLES[verification]
  if (!style) return null // old data without a verification field renders nothing

  return (
    <span
      title={style.hint}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.classes} ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {style.label}
    </span>
  )
}

export default VerificationBadge