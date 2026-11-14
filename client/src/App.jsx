import { useCallback, useEffect, useState } from 'react'
import ClaimCard from '@/components/ClaimCard'
import FilterBar from '@/components/FilterBar'
import EvidenceDrawer from '@/components/EvidenceDrawer'
import FirstWeekPlan from '@/components/FirstWeekPlan'
import Timeline from '@/components/Timeline'
import ConflictResolver from '@/components/ConflictResolver'
import GapQuestions from '@/components/GapQuestions'
import ApprovalBar from '@/components/ApprovalBar'
import AcknowledgeBar from '@/components/AcknowledgeBar'
import AuditLog from '@/components/AuditLog'
import VersionHistory from '@/components/VersionHistory'
import Sources from '@/components/Sources'
import StatsRow from '@/components/StatsRow'
import Hero from '@/components/Hero'
import Login from '@/components/Login'
import UserBar from '@/components/UserBar'
import { canReview } from '@/lib/roles'
import { findGaps } from '@/lib/gaps'
import { describeCounts } from '@/lib/redact'
import { api } from '@/lib/api'

const EMPTY_APPROVAL = {
  approval: null,
  acknowledgements: {},
  pendingCount: 0,
  changedCount: 0,
  nextVersion: 1,
  versions: [],
}

// Everything the signed-in role is allowed to load. The server filters the
// claims for the role, so this never decides what a person may see.
async function fetchAll(role) {
  const lead = role === 'lead'
  const [claims, approval, audit, sources, resolutions] = await Promise.all([
    api.claims(),
    api.approval(),
    lead ? api.audit() : [],
    lead ? api.sources() : [],
    lead ? api.resolutions() : [],
  ])
  return { claims, approval, audit, sources, resolutions }
}

function App() {
  const [user, setUser] = useState(() => api.currentUser())
  const [claims, setClaims] = useState([])
  const [approvalState, setApprovalState] = useState(EMPTY_APPROVAL)
  const [resolutions, setResolutions] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(() => Boolean(api.currentUser()))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [gapNotice, setGapNotice] = useState('')
  const [view, setView] = useState('claims')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [verification, setVerification] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const role = user?.role

  const applyData = useCallback((data) => {
    setClaims(data.claims)
    setApprovalState({ ...EMPTY_APPROVAL, ...data.approval })
    setAuditLog(data.audit)
    setSources(data.sources)
    setResolutions(data.resolutions)
  }, [])

  const clearData = useCallback(() => {
    setClaims([])
    setApprovalState(EMPTY_APPROVAL)
    setAuditLog([])
    setSources([])
    setResolutions([])
  }, [])

  // The server rejected our token (expired or revoked): go back to sign-in.
  useEffect(() => {
    api.onUnauthorized(() => {
      setUser(null)
      clearData()
      setNotice('Your session expired. Sign in again.')
    })
  }, [clearData])

  // Load everything when someone signs in, or when a saved session is restored.
  useEffect(() => {
    if (!user) return undefined
    let cancelled = false
    fetchAll(user.role)
      .then((data) => {
        if (!cancelled) applyData(data)
      })
      .catch((err) => {
        // A 401 already sent the app back to sign-in with its own message.
        if (!cancelled && err.status !== 401) setNotice(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, applyData])

  const { approval, acknowledgements, pendingCount, changedCount, nextVersion, versions } =
    approvalState

  // Incoming roles see nothing until the reviewer approves a version.
  const locked = role !== 'lead' && !approval
  const roleClaims = locked ? [] : claims
  const gaps = role === 'lead' ? findGaps(claims) : []

  const views = [
    { value: 'claims', label: 'Claims' },
    { value: 'timeline', label: 'Timeline' },
    { value: 'plan', label: 'First-week plan' },
    ...(role === 'lead'
      ? [
          { value: 'conflicts', label: 'Conflicts' },
          {
            value: 'gaps',
            label: gaps.length > 0 ? `Gap questions (${gaps.length})` : 'Gap questions',
          },
          { value: 'sources', label: 'Sources' },
          { value: 'versions', label: 'Versions' },
          { value: 'audit', label: 'Audit log' },
        ]
      : []),
  ]
  const activeView = views.some((item) => item.value === view) ? view : 'claims'

  const visibleClaims = roleClaims.filter(
    (claim) =>
      (status === 'all' || claim.status === status) &&
      (type === 'all' || claim.type === type)
  )

  const selectedClaim = roleClaims.find((claim) => claim.id === selectedId) ?? null

  function handleLogin(nextUser) {
    setLoading(true)
    setNotice('')
    setUser(nextUser)
    setView('claims')
    setStatus('all')
    setType('all')
    setSelectedId(null)
    setGapNotice('')
  }

  function handleLogout() {
    api.logout()
    setUser(null)
    clearData()
    setSelectedId(null)
    setGapNotice('')
    setNotice('')
  }

  // Runs one change on the server, then reloads so the screen shows exactly what
  // the server now holds. A failure shows as a message and changes nothing here.
  async function act(change) {
    setBusy(true)
    setNotice('')
    try {
      const result = await change()
      applyData(await fetchAll(role))
      return result ?? true
    } catch (err) {
      setNotice(err.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  // The Sources form shows its own errors, so this one lets them through.
  async function handleImport(file, sensitivity, formality) {
    const result = await api.uploadSource(file, sensitivity, formality)
    applyData(await fetchAll(role))
    return result
  }

  function handleApprove() {
    return act(() => api.approve())
  }

  function handleRevoke() {
    return act(() => api.revoke())
  }

  function handleAcknowledge() {
    return act(() => api.acknowledge())
  }

  function handleReview(id, state) {
    return act(() => api.review(id, state === 'accepted' ? 'accept' : 'reject'))
  }

  function handleEdit(id, statement) {
    return act(() => api.review(id, 'edit', statement))
  }

  function handleResolve(keepId, dropId) {
    return act(() => api.resolve(keepId, dropId))
  }

  async function handleAnswer(id, answer) {
    const result = await act(() => api.answer(id, answer.trim()))
    if (!result) return
    const { redacted } = result
    if (redacted && redacted.total > 0) {
      setGapNotice(
        `Your answer was saved, but ${redacted.total} sensitive ${
          redacted.total === 1 ? 'item was' : 'items were'
        } redacted (${describeCounts(redacted)}). Share secrets through a restricted source instead.`
      )
    } else {
      setGapNotice('')
    }
  }

  if (!user) {
    return <Login onLogin={handleLogin} notice={notice} />
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <h1 className="text-xl font-semibold">
          Handover<span className="font-serif text-2xl italic">Trail</span>
        </h1>
        <UserBar user={user} onLogout={handleLogout} />
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <Hero />

        {notice && (
          <p
            role="alert"
            className="flex items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
          >
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} className="underline">
              Dismiss
            </button>
          </p>
        )}

        {loading ? (
          <p role="status" className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Loading the handover...
          </p>
        ) : (
          <>
            {busy && (
              <p role="status" className="text-xs text-muted-foreground">
                Saving...
              </p>
            )}

            <ApprovalBar
              role={role}
              approval={approval}
              pendingCount={pendingCount}
              changedCount={changedCount}
              nextVersion={nextVersion}
              onApprove={handleApprove}
              onRevoke={handleRevoke}
            />

            <AcknowledgeBar
              role={role}
              approval={approval}
              acknowledgements={acknowledgements}
              onAcknowledge={handleAcknowledge}
            />

            {!locked && (
              <>
                <StatsRow claims={roleClaims} />

                <div className="flex flex-wrap gap-4 border-b">
                  {views.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setView(item.value)}
                      aria-pressed={activeView === item.value}
                      className={`-mb-px border-b-2 px-1 pb-2 text-sm transition-colors ${
                        activeView === item.value
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {activeView === 'claims' && (
                  <>
                    <FilterBar
                      status={status}
                      type={type}
                      onStatusChange={setStatus}
                      onTypeChange={setType}
                    />

                    <p className="text-xs text-muted-foreground">
                      Showing {visibleClaims.length} of {roleClaims.length} claims
                    </p>

                    <div className="space-y-3">
                      {visibleClaims.map((claim, index) => (
                        <ClaimCard
                          key={claim.id}
                          claim={claim}
                          onSelect={setSelectedId}
                          index={index}
                        />
                      ))}
                      {visibleClaims.length === 0 && (
                        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          No claims match these filters.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {activeView === 'timeline' && (
                  <Timeline claims={roleClaims} onSelect={setSelectedId} />
                )}

                {activeView === 'plan' && (
                  <FirstWeekPlan claims={roleClaims} onSelect={setSelectedId} />
                )}

                {activeView === 'conflicts' && (
                  <ConflictResolver
                    claims={roleClaims}
                    resolutions={resolutions}
                    onResolve={handleResolve}
                  />
                )}

                {activeView === 'gaps' && (
                  <>
                    {gapNotice && (
                      <p
                        role="status"
                        className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400"
                      >
                        {gapNotice}
                      </p>
                    )}
                    <GapQuestions questions={gaps} onAnswer={handleAnswer} />
                  </>
                )}

                {activeView === 'sources' && (
                  <Sources sources={sources} onImport={handleImport} />
                )}

                {activeView === 'versions' && (
                  <VersionHistory
                    versions={versions}
                    currentVersion={approval?.version ?? null}
                  />
                )}

                {activeView === 'audit' && <AuditLog entries={auditLog} />}
              </>
            )}
          </>
        )}
      </main>

      <EvidenceDrawer
        claim={selectedClaim}
        allClaims={roleClaims}
        onClose={() => setSelectedId(null)}
        onReview={handleReview}
        onEdit={handleEdit}
        canReview={canReview(role)}
      />
    </div>
  )
}

export default App
