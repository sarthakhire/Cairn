import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import {
  EMPTY_AUDIT_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  mergeRows,
  validateAuditFilters,
} from '@/lib/auditQuery'

// VITE_AUDIT_PAGE_SIZE only exists to try paging with a few mock rows.
const SIZE = Number(import.meta.env?.VITE_AUDIT_PAGE_SIZE) || PAGE_SIZE

const ACTION_HINTS = [
  'Accepted',
  'Edited',
  'Rejected',
  'Reopened',
  'Conflict resolved',
  'Handover approved',
  'Approval revoked',
  'Acknowledged',
  'Gap answered',
  'Source imported',
  'Access denied',
]

const inputClass =
  'w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

function Field({ id, label, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function AuditLog() {
  const [draft, setDraft] = useState(EMPTY_AUDIT_FILTERS)
  const [applied, setApplied] = useState(EMPTY_AUDIT_FILTERS)
  const [rows, setRows] = useState([])
  const [cursor, setCursor] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [formError, setFormError] = useState('')
  const latest = useRef(0)

  // Only the newest request may update the screen, so a slow older answer can never
  // overwrite a newer one.
  const load = useCallback(async (filters, before, append) => {
    latest.current += 1
    const ticket = latest.current
    try {
      const page = await api.auditEvents(filters, { before, limit: SIZE })
      if (ticket !== latest.current) return
      const incoming = Array.isArray(page?.rows) ? page.rows : []
      setRows((current) => (append ? mergeRows(current, incoming) : incoming))
      setCursor(page?.nextCursor ?? null)
      setError('')
      setStatus('ready')
    } catch (err) {
      if (ticket !== latest.current) return
      setError(err.message)
      setStatus(append ? 'ready' : 'error')
    } finally {
      if (ticket === latest.current) setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    load(EMPTY_AUDIT_FILTERS, null, false)
  }, [load])

  function change(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function apply(event) {
    event.preventDefault()
    const problem = validateAuditFilters(draft)
    if (problem) {
      setFormError(problem)
      return
    }
    setFormError('')
    setApplied(draft)
    setStatus('loading')
    setError('')
    load(draft, null, false)
  }

  function clear() {
    setDraft(EMPTY_AUDIT_FILTERS)
    setApplied(EMPTY_AUDIT_FILTERS)
    setFormError('')
    setStatus('loading')
    setError('')
    load(EMPTY_AUDIT_FILTERS, null, false)
  }

  function retry() {
    setStatus('loading')
    setError('')
    load(applied, null, false)
  }

  function loadMore() {
    setLoadingMore(true)
    setError('')
    load(applied, cursor, true)
  }

  const filtered = activeFilterCount(applied) > 0
  const canClear = filtered || activeFilterCount(draft) > 0

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Every review action and every refused request is recorded here, newest first.
        Denied requests are marked.
      </p>

      <form onSubmit={apply} className="space-y-3 rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="audit-actor" label="Actor">
            <input
              id="audit-actor"
              value={draft.actor}
              onChange={(event) => change('actor', event.target.value)}
              placeholder="e.g. Demo Lead"
              className={inputClass}
            />
          </Field>
          <Field id="audit-action" label="Action">
            <input
              id="audit-action"
              list="audit-actions"
              value={draft.action}
              onChange={(event) => change('action', event.target.value)}
              placeholder="e.g. Rejected"
              className={inputClass}
            />
            <datalist id="audit-actions">
              {ACTION_HINTS.map((hint) => (
                <option key={hint} value={hint} />
              ))}
            </datalist>
          </Field>
          <Field id="audit-outcome" label="Outcome">
            <select
              id="audit-outcome"
              value={draft.outcome}
              onChange={(event) => change('outcome', event.target.value)}
              className={inputClass}
            >
              <option value="all">All</option>
              <option value="allowed">Allowed</option>
              <option value="denied">Denied</option>
            </select>
          </Field>
          <Field id="audit-claim" label="Claim id">
            <input
              id="audit-claim"
              value={draft.claimId}
              onChange={(event) => change('claimId', event.target.value)}
              placeholder="e.g. c_014"
              className={inputClass}
            />
          </Field>
          <Field id="audit-from" label="From date">
            <input
              id="audit-from"
              type="date"
              value={draft.from}
              onChange={(event) => change('from', event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="audit-to" label="To date">
            <input
              id="audit-to"
              type="date"
              value={draft.to}
              onChange={(event) => change('to', event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {formError && (
          <p role="alert" className="text-xs text-red-400">
            {formError}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Apply filters
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!canClear} onClick={clear}>
            Clear
          </Button>
        </div>
      </form>

      {status === 'loading' && (
        <p
          role="status"
          className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
        >
          Loading the audit trail...
        </p>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm"
        >
          <p className="text-red-400">{error || 'The audit trail could not be loaded.'}</p>
          <Button size="sm" variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'} loaded
            {filtered && ' (filtered)'}
            {cursor && ', more available'}
          </p>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {filtered
                ? 'No audit entries match these filters.'
                : 'No audit entries yet.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row, index) => {
                const denied = row.outcome === 'denied'
                return (
                  <li
                    key={row.id ?? `${row.at}-${index}`}
                    className={`space-y-1 rounded-md border bg-card p-3 ${
                      denied ? 'border-red-500/40' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.action}</span>
                        {denied && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
                            Denied
                          </span>
                        )}
                        {row.claimId && (
                          <span className="text-xs text-muted-foreground">{row.claimId}</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {String(row.at ?? '').replace('T', ' ')}
                      </span>
                    </div>
                    {row.detail && <p className="text-sm">{row.detail}</p>}
                    <p className="text-xs text-muted-foreground">
                      By {row.actor ?? 'Unknown'}
                      {row.role && ` (${String(row.role).replace('_', ' ')})`}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}

          {cursor && (
            <Button variant="outline" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Loading...' : 'Load more'}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

export default AuditLog