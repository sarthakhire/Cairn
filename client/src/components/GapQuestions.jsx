import { useState } from 'react'
import { questionFor } from '@/lib/gaps'

function Question({ claim, onAnswer }) {
  const [text, setText] = useState('')
  const evidence = claim.evidence[0]

  function submit() {
    const answer = text.trim()
    if (!answer) return
    onAnswer(claim.id, answer)
  }

  return (
    <li className="space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-amber-400">
          {claim.status === 'missing' ? 'Missing from the sources' : 'AI inference to confirm'}
        </p>
        <p className="text-sm font-medium">{questionFor(claim)}</p>
        {evidence && (
          <p className="text-xs text-muted-foreground">
            Based on {evidence.source}, {evidence.date}
          </p>
        )}
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        aria-label={`Answer: ${questionFor(claim)}`}
        placeholder="Type the answer from the departing member"
        className="w-full rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim()}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save answer
      </button>
    </li>
  )
}

function GapQuestions({ questions, onAnswer }) {
  if (questions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No open questions. Everything the sources left unclear has been answered.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        These are things the sources could not settle. Each answer becomes a new
        claim that stays Uncertain until a reviewer accepts it.
      </p>
      <ul className="space-y-3">
        {questions.map((claim) => (
          <Question key={claim.id} claim={claim} onAnswer={onAnswer} />
        ))}
      </ul>
    </div>
  )
}

export default GapQuestions
