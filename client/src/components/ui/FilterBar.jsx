const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'uncertain', label: 'Uncertain' },
  { value: 'conflicting', label: 'Conflicting' },
  { value: 'missing', label: 'Missing' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'decision', label: 'Decision' },
  { value: 'open_question', label: 'Open question' },
  { value: 'ownership', label: 'Ownership' },
  { value: 'risk_dependency', label: 'Risk or dependency' },
  { value: 'next_action', label: 'Next action' },
]

function Chips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function FilterBar({ status, type, onStatusChange, onTypeChange }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
        <Chips options={STATUS_OPTIONS} value={status} onChange={onStatusChange} />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Type</p>
        <Chips options={TYPE_OPTIONS} value={type} onChange={onTypeChange} />
      </div>
    </div>
  )
}

export default FilterBar