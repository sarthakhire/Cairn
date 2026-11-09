import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'

function CountUp({ value, suffix = '' }) {
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    const controls = animate(0, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    })
    return () => controls.stop()
  }, [value, reduceMotion])

  const shown = reduceMotion ? value : display
  return (
    <>
      {shown}
      {suffix}
    </>
  )
}

function Stat({ label, value, suffix, tone = '' }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className={`text-3xl font-semibold ${tone}`}>
        <CountUp value={value} suffix={suffix} />
      </p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  )
}

function StatsRow({ claims }) {
  const total = claims.length
  const verified = claims.filter((claim) => claim.status === 'verified').length
  const conflicts = claims.filter((claim) => claim.status === 'conflicting').length
  const missing = claims.filter((claim) => claim.status === 'missing').length
  const verifiedPercent = total === 0 ? 0 : Math.round((verified / total) * 100)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Claims" value={total} />
      <Stat
        label="Verified"
        value={verifiedPercent}
        suffix="%"
        tone="text-emerald-400"
      />
      <Stat
        label="Conflicts"
        value={conflicts}
        tone={conflicts > 0 ? 'text-red-400' : ''}
      />
      <Stat
        label="Missing"
        value={missing}
        tone={missing > 0 ? 'text-amber-400' : ''}
      />
    </div>
  )
}

export default StatsRow