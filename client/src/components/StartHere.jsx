import { useState } from 'react'

const STEPS = [
  { text: 'Open a claim and read the Evidence check.', view: 'claims', go: 'Go to Claims' },
  { text: 'Open the Review queue and reject one claim with a reason.', view: 'queue', go: 'Go to Review queue' },
  { text: 'Try to approve and read the blockers.', view: null, go: null },
  { text: 'Preview as Incoming developer.', view: null, go: null },
  { text: 'Open the Audit log.', view: 'audit', go: 'Go to Audit log' },
]

function StartHere({ onGo }) {
  const [hidden, setHidden] = useState(false)
  const [done, setDone] = useState([])

  if (hidden) return null

  function toggle(index) {
    setDone((list) =>
      list.includes(index) ? list.filter((item) => item !== index) : [...list, index]
    )
  }

  return (
    <section aria-label="Start here" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Start here</h2>
          <p className="text-xs text-muted-foreground">
            Five steps to see what HandoverTrail does. {done.length} of {STEPS.length} done.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="text-xs underline text-muted-foreground"
        >
          Dismiss
        </button>
      </div>
      <ol className="space-y-2">
        {STEPS.map((step, index) => (
          <li key={step.text} className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="checkbox"
              id={`start-step-${index}`}
              checked={done.includes(index)}
              onChange={() => toggle(index)}
            />
            <label htmlFor={`start-step-${index}`}>
              {index + 1}. {step.text}
            </label>
            {step.view && (
              <button
                type="button"
                onClick={() => onGo(step.view)}
                className="text-xs underline text-muted-foreground"
              >
                {step.go}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

export default StartHere