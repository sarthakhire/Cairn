// Lead-only control: preview what an incoming role would see if the lead approved now.
// The server builds that view (GET /api/claims?as=<role>); this only picks the role.

const OPTIONS = [
  { value: null, label: 'Me' },
  { value: 'incoming_lead', label: 'Incoming lead' },
  { value: 'incoming_developer', label: 'Incoming developer' },
]

function PreviewBar({ value, onChange, disabled = false }) {
  const current = OPTIONS.find((option) => option.value === value)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Preview as:</span>
        {OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-md border px-2.5 py-1 transition-colors disabled:opacity-50 ${
              value === option.value
                ? 'border-primary bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {value && (
        <p
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400"
        >
          <span>
            Preview of what {current.label} would see if you approved now. Review actions are
            turned off while you preview.
          </span>
          <button type="button" onClick={() => onChange(null)} className="underline">
            Back to my view
          </button>
        </p>
      )}
    </div>
  )
}

export default PreviewBar