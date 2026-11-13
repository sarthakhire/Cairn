import { useState } from 'react'
import { MASK, describeCounts, redact } from '@/lib/redact'

const MAX_BYTES = 2 * 1024 * 1024
const PREVIEW_CHARS = 1500

const SENSITIVITY = [
  { value: 'team', label: 'Team' },
  { value: 'lead_only', label: 'Lead only' },
  { value: 'restricted', label: 'Restricted' },
]

const TONE = {
  team: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  lead_only: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  restricted: 'border-red-500/30 bg-red-500/15 text-red-400',
}

function labelFor(value) {
  return SENSITIVITY.find((item) => item.value === value)?.label ?? value
}

function hasSupportedType(name) {
  return /\.(md|json|csv)$/i.test(name)
}

function Preview({ text }) {
  const parts = text.split(/(\[REDACTED\])/g)
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs">
      {parts.map((part, index) =>
        part === MASK ? (
          <span
            key={index}
            className="rounded bg-red-500/20 px-1 text-red-400"
          >
            {MASK}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </pre>
  )
}

// onImport(file, sensitivity, formality) uploads the file and resolves with the
// server's reply ({ chunkCount, redactions, redactedTotal }). It rejects with an
// Error whose message is safe to show.
function Sources({ sources, onImport }) {
  const [file, setFile] = useState(null)
  const [fileKey, setFileKey] = useState(0)
  const [sensitivity, setSensitivity] = useState('')
  const [formality, setFormality] = useState('informal')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [previews, setPreviews] = useState({})
  const [openName, setOpenName] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!file) {
      setError('Choose a file first.')
      return
    }
    if (!sensitivity) {
      setError('Choose a sensitivity label. Every source needs one.')
      return
    }
    if (!hasSupportedType(file.name)) {
      setError('Unsupported file type. Use .md, .json or .csv.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('File is too large. The limit is 2 MB.')
      return
    }
    if (sources.some((item) => item.name.toLowerCase() === file.name.toLowerCase())) {
      setError('A source with this name already exists.')
      return
    }

    setBusy(true)
    try {
      const original = await file.text()
      if (!original.trim()) {
        setError('The file is empty.')
        return
      }

      const result = await onImport(file, sensitivity, formality)

      // The server did the real redaction. This preview only shows the reviewer what it looks like.
      if (sensitivity !== 'restricted') {
        const masked = redact(original).text
        const preview =
          masked.length > PREVIEW_CHARS ? `${masked.slice(0, PREVIEW_CHARS)}\n...` : masked
        setPreviews((current) => ({ ...current, [file.name]: preview }))
      }

      const label = labelFor(sensitivity)
      if (sensitivity === 'restricted') {
        setNotice(`Imported ${file.name} as ${label}, ${result.chunkCount} chunks. Stored as written; only the reviewer can read it.`)
      } else if (result.redactedTotal > 0) {
        setNotice(
          `Imported ${file.name} as ${label}, ${result.chunkCount} chunks. ${result.redactedTotal} sensitive ${
            result.redactedTotal === 1 ? 'item was' : 'items were'
          } redacted (${describeCounts(result.redactions)}).`
        )
      } else {
        setNotice(`Imported ${file.name} as ${label}, ${result.chunkCount} chunks. Nothing needed redacting.`)
      }
      setFile(null)
      setFileKey((current) => current + 1)
      setSensitivity('')
      setFormality('informal')
    } catch (err) {
      setError(err.message || 'The file could not be imported.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Every source gets a sensitivity label when it is imported. For team and
        lead-only sources, the server redacts credentials, emails and phone
        numbers before anything is stored, so only the redacted copy exists.
        Restricted sources are stored as written, because that is where secrets
        belong, and only the reviewer can read them.
      </p>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border bg-card p-4"
      >
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted-foreground">
            File (.md, .json or .csv, up to 2 MB)
          </span>
          <input
            key={fileKey}
            type="file"
            accept=".md,.json,.csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Sensitivity</span>
            <select
              value={sensitivity}
              onChange={(event) => setSensitivity(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Choose a label</option>
              {SENSITIVITY.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Formality</span>
            <select
              value={formality}
              onChange={(event) => setFormality(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="informal">Informal (chat, quick notes)</option>
              <option value="formal">Formal (minutes, written decisions)</option>
            </select>
          </label>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-emerald-400">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Importing...' : 'Import source'}
        </button>
      </form>

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          Imported sources ({sources.length})
        </h3>
        {sources.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing imported yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {sources.map((item) => {
              const preview = previews[item.name]
              const open = openName === item.name
              return (
                <li key={item.name} className="space-y-3 rounded-md border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="space-y-0.5">
                      <span className="block font-medium">{item.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.kind}, {item.formality}, {item.chunkCount} chunks,{' '}
                        {item.at.replace('T', ' ')}
                      </span>
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        TONE[item.sensitivity] ?? ''
                      }`}
                    >
                      {labelFor(item.sensitivity)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    {item.sensitivity === 'restricted' ? (
                      <span className="text-muted-foreground">
                        Stored as written, reviewer only
                      </span>
                    ) : item.redactedTotal > 0 ? (
                      <span className="text-red-400">
                        {item.redactedTotal}{' '}
                        {item.redactedTotal === 1 ? 'item' : 'items'} redacted:{' '}
                        {describeCounts(item.redactions)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Scanned, nothing to redact
                      </span>
                    )}
                    {preview && (
                      <button
                        type="button"
                        onClick={() => setOpenName(open ? null : item.name)}
                        aria-expanded={open}
                        className="rounded-md border px-2.5 py-1 transition-colors hover:bg-accent"
                      >
                        {open ? 'Hide preview' : 'Show redacted preview'}
                      </button>
                    )}
                  </div>

                  {open && preview && <Preview text={preview} />}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default Sources
