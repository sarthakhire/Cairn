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
import { countWarnings } from '@/lib/warnings'
import ReviewQueue from '@/components/ReviewQueue'
import PreviewBar from '@/components/PreviewBar'
import WakeUp from '@/components/WakeUp'
import { api, USING_MOCK } from '@/lib/api'

const NO_ISSUE = { message: '', blockers: [] }
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
  const [claims, approval, sources, resolutions] = await Promise.all([
    api.claims(),
    api.approval(),
    lead ? api.sources() : [],
    lead ? api.resolutions() : [],
  ])
  return { claims, approval, sources, resolutions }
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
  const [issue, setIssue] = useState(NO_ISSUE)
  const [view, setView] = useState('claims')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [verification, setVerification] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [previewAs, setPreviewAs] = useState(null)
  const [previewClaims, setPreviewClaims] = useState([])
  const [serverReady, setServerReady] = useState(USING_MOCK)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

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
    setPreviewAs(null)
    setPreviewClaims([])
    setIssue(NO_ISSUE)
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
    if (!user || !serverReady) return undefined
    let cancelled = false
    fetchAll(user.role)
      .then((data) => {
        if (!cancelled) applyData(data)
      })
      .catch((err) => {
        // A 401 already sent the app back to sign-in with its own message.
        if (!cancelled && err.status !== 401) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, serverReady, reloadKey, applyData])

  const { approval, acknowledgements, pendingCount, changedCount, nextVersion, versions } =
    approvalState

  // Incoming roles see nothing until the reviewer approves a version.
  const locked = role !== 'lead' && !approval
  const roleClaims = previewAs ? previewClaims : locked ? [] : claims
  const gaps = role === 'lead' ? findGaps(claims) : []
  const draftCount = claims.filter((claim) => claim.review?.state === 'draft').length
  const [queueTarget, setQueueTarget] = useState(null)

  const views = [
    { value: 'claims', label: 'Claims' },
    { value: 'timeline', label: 'Timeline' },
    { value: 'plan', label: 'First-week plan' },
    ...(role === 'lead' && !previewAs
      ? [
        {
          value: 'queue',
          label: draftCount > 0 ? `Review queue (${draftCount})` : 'Review queue',
        },
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
      (type === 'all' || claim.type === type) &&
      (verification === 'all' || (claim.verification ?? 'none') === verification)
  )

  const selectedClaim = roleClaims.find((claim) => claim.id === selectedId) ?? null
  // Opens the evidence drawer from the queue, straight into a review form.
  function openFromQueue(id, mode = 'idle') {
    setQueueTarget({ id, mode })
    setSelectedId(id)
  }
  function handleLogin(nextUser) {
    setLoading(true)
    setNotice('')
    setUser(nextUser)
    setLoadError('')
    setView('claims')
    setStatus('all')
    setType('all')
    setVerification('all')
    setSelectedId(null)
    setGapNotice('')
  }
  // Lead-only preview. The server builds the view (GET /api/claims?as=<role>), so this
  // shows what that role would really get. Nothing here changes any data.
  async function handlePreview(next) {
    setSelectedId(null)
    setQueueTarget(null)
    setNotice('')
    if (!next) {
      setPreviewAs(null)
      setPreviewClaims([])
      return
    }
    setBusy(true)
    try {
      const list = await api.claims(next)
      // Incoming roles never see drafts, rejected claims or review history. If any of
      // them is here, the server ignored `as` and this would be a false preview.
      const leaked = list.some(
        (claim) =>
          claim.review?.state === 'draft' ||
          claim.review?.state === 'rejected' ||
          claim.review?.history !== undefined
      )
      if (leaked) {
        setNotice('The server did not return a filtered preview, so the preview is off.')
        return
      }
      setPreviewClaims(list)
      setPreviewAs(next)
    } catch (err) {
      setNotice(err.message)
    } finally {
      setBusy(false)
    }
  }
  function handleLogout() {
    api.logout()
    setQueueTarget(null)
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
      setIssue(NO_ISSUE)
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

  async function handleApprove() {
    setBusy(true)
    setNotice('')
    try {
      await api.approve()
      setIssue(NO_ISSUE)
      applyData(await fetchAll(role))
    } catch (err) {
      // A 409 with blockers is a list to work through, not an error banner.
      if (err.status === 409) {
        setIssue({
          message: err.message,
          blockers: Array.isArray(err.body?.blockers) ? err.body.blockers : [],
        })
      } else {
        setNotice(err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  function handleRevoke() {
    return act(() => api.revoke())
  }

  function handleAcknowledge() {
    return act(() => api.acknowledge())
  }

  // The drawer sends 'accept' or 'reject' with an optional reason or override.
  // The older 'accepted' and 'rejected' spellings are still understood.
  function handleReview(id, action, extra) {
    const name = action === 'accepted' ? 'accept' : action === 'rejected' ? 'reject' : action
    return act(() => api.review(id, name, extra))
  }

  function handleEdit(id, statement, extra) {
    return act(() => api.review(id, 'edit', { statement, ...extra }))
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
        `Your answer was saved, but ${redacted.total} sensitive ${redacted.total === 1 ? 'item was' : 'items were'
        } redacted (${describeCounts(redacted)}). Share secrets through a restricted source instead.`
      )
    } else {
      setGapNotice('')
    }
  }

  if (!serverReady) return <WakeUp onReady={setServerReady} />

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

        {loadError ? (
          <div role="alert" className="rounded-lg border border-destructive/50 p-6 text-center">
            <p className="text-sm">Could not load the handover. {loadError}</p>
            <button
              type="button"
              className="mt-3 text-sm underline"
              onClick={() => {
                setLoadError('')
                setLoading(true)
                setReloadKey((k) => k + 1)
              }}
            >
              Try again
            </button>
          </div>
        ) : loading ? (
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
              issue={issue}
              warnings={role === 'lead' ? countWarnings(claims) : null}
              claims={claims}
              busy={busy}
              onSelectClaim={setSelectedId}
            />

            <AcknowledgeBar
              role={role}
              approval={approval}
              acknowledgements={acknowledgements}
              onAcknowledge={handleAcknowledge}
            />
            {role === 'lead' && (
              <PreviewBar value={previewAs} onChange={handlePreview} disabled={busy} />
            )}
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
                      className={`-mb-px border-b-2 px-1 pb-2 text-sm transition-colors ${activeView === item.value
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
                      verification={verification}
                      showVerification={roleClaims.some((claim) => claim.verification)}
                      onStatusChange={setStatus}
                      onTypeChange={setType}
                      onVerificationChange={setVerification}
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
                          {locked
                            ? 'Nothing has been shared yet. The lead has not approved a handover.'
                            : roleClaims.length === 0
                              ? 'There are no claims yet.'
                              : 'No claims match these filters.'}
                        </p>
                      )}
                    </div>
                  </>
                )}
                {activeView === 'queue' && (
                  <ReviewQueue
                    claims={roleClaims}
                    busy={busy}
                    onOpen={openFromQueue}
                    onReview={handleReview}
                  />
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

                {activeView === 'audit' && <AuditLog />}
              </>
            )}
          </>
        )}
      </main>

      <EvidenceDrawer
        claim={selectedClaim}
        allClaims={roleClaims}
        onClose={() => {
          setSelectedId(null)
          setQueueTarget(null)
        }}
        onReview={handleReview}
        onEdit={handleEdit}
        canReview={canReview(role) && !previewAs}
        error={notice}
        startMode={queueTarget && queueTarget.id === selectedId ? queueTarget.mode : 'idle'}
      />
    </div>
  )
}

export default App
