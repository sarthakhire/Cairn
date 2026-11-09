import { motion, useReducedMotion } from 'motion/react'

function Hero() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-3 py-4"
    >
      <p className="text-xs uppercase tracking-widest text-primary">
        Evidence-linked handover
      </p>
      <h2 className="text-4xl font-semibold leading-tight sm:text-5xl">
        Every claim shows its{' '}
        <span className="font-serif italic">evidence</span>, its doubt and its
        reviewer.
      </h2>
      <p className="max-w-xl text-sm text-muted-foreground">
        Nothing reaches the incoming person until a reviewer has accepted,
        corrected or rejected it.
      </p>
    </motion.section>
  )
}

export default Hero