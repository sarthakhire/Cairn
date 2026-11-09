const STYLES = {
  verified: {
    label: 'Verified',
    classes: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  },
  uncertain: {
    label: 'Uncertain',
    classes: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  },
  conflicting: {
    label: 'Conflicting',
    classes: 'border-red-500/30 bg-red-500/15 text-red-400',
  },
  missing: {
    label: 'Missing',
    classes: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-400',
  },
}

function StatusBadge({ status }) {
  const style = STYLES[status] ?? STYLES.missing

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.classes}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {style.label}
    </span>
  )
}

export default StatusBadge