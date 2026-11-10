import { useState } from 'react'
import initialClaims from '@/mock/claims.json'
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
import StatsRow from '@/components/StatsRow'
import Hero from '@/components/Hero'
import Login from '@/components/Login'
import UserBar from '@/components/UserBar'
import { ROLES, claimsForRole, canReview } from '@/lib/roles'
import { findGaps, questionFor } from '@/lib/gaps'
import { summarize, countChanges } from '@/lib/versions'

function short(text) {
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
}

function App() {
  const [user, setUser] = useState(null)
  const [claims, setClaims] = useState(initialClaims)
  const [resolutions, setResolutions] = useState([])
  const [versions, setVersions] = useState([])
  const [approval, setApproval] = useState(null)
  const [acknowledgements, setAcknowledgements] = useState({})
  const [auditLog, setAuditLog] = useState([])
  const [view, setView] = useState('claims')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const role = user?.role

  const snapshot = approval
    ? (versions.find((item) => item.number === approval.version)?.claims ?? claims)
    : claims
  const source = role === 'lead' ? claims : snapshot

  const locked = role !== 'lead' && !approval
  const roleClaims = locked ? [] : claimsForRole(source, role)
  const pendingCount = claims.filter((claim) => claim.review.state === 'draft').length
  const changedCount = approval ? countChanges(snapshot, claims) : 0
  const gaps = findGaps(claims)

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

  function now() {
    return new Date().toISOString().slice(0, 19)
  }

  function log(action, detail, actor = 'Lead') {
    setAuditLog((current) => [{ at: now(), actor, action, detail }, ...current])
  }

  function handleLogin(nextUser) {
    setUser(nextUser)
    setView('claims')
    setStatus('all')
    setType('all')
    setSelectedId(null)
  }

  function handleLogout() {
    setUser(null)
    setSelectedId(null)
  }

  function handleApprove() {
    const number = versions.length + 1
    const at = now()
    setVersions((current) => [
      ...current,
      { number, by: 'Lead', at, claims, summary: summarize(claims) },
    ])
    setApproval({ by: 'Lead', at, version: number })
    setAcknowledgements({})
    log(
      'Handover approved',
      `Version ${number}. ${pendingCount} claims were still draft at approval.`
    )
  }

  function handleRevoke() {
    setApproval(null)
    setAcknowledgements({})
    log('Approval revoked', 'Incoming roles can no longer see the handover.')
  }

  function handleAcknowledge(roleValue) {
    setAcknowledgements((current) => ({
      ...current,
      [roleValue]: { at: now() },
    }))
    const label = ROLES.find((item) => item.value === roleValue)?.label ?? roleValue
    log('Acknowledged', 'Confirmed receipt of the handover.', label)
  }

  function handleReview(id, state) {
    const claim = claims.find((item) => item.id === id)
    const at = now()
    setClaims((current) =>
      current.map((item) =>
        item.id === id ? { ...item, review: { state, by: 'Lead', at } } : item
      )
    )
    if (claim) {
      log(state === 'accepted' ? 'Accepted' : 'Rejected', short(claim.statement))
    }
  }

  function handleEdit(id, statement) {
    const claim = claims.find((item) => item.id === id)
    const at = now()
    setClaims((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, statement, review: { state: 'edited', by: 'Lead', at } }
          : item
      )
    )
    if (claim) {
      log('Edited', `From: ${short(claim.statement)} To: ${short(statement)}`)
    }
  }

  function handleResolve(keepId, dropId) {
    const at = now()
    const keep = claims.find((claim) => claim.id === keepId)
    const drop = claims.find((claim) => claim.id === dropId)
    if (!keep || !drop) return

    setClaims((current) =>
      current.map((claim) => {
        if (claim.id === keepId) {
          return {
            ...claim,
            status: 'verified',
            conflictsWith: [],
            review: { state: 'accepted', by: 'Lead', at },
          }
        }
        if (claim.id === dropId) {
          return {
            ...claim,
            status: 'uncertain',
            conflictsWith: [],
            review: { state: 'rejected', by: 'Lead', at },
          }
        }
        return claim
      })
    )

    setResolutions((current) => [
      {
        keepStatement: keep.statement,
        dropStatement: drop.statement,
        by: 'Lead',
        at,
      },
      ...current,
    ])

    log(
      'Conflict resolved',
      `Kept: ${short(keep.statement)} Set aside: ${short(drop.statement)}`
    )
  }

  function handleAnswer(id, answer) {
    const original = claims.find((claim) => claim.id === id)
    const text = answer.trim()
    if (!original || !text) return

    const question = questionFor(original)
    const replacement = {
      id: `c_gap_${Date.now()}`,
      type: original.type,
      statement: `${question} Answer: ${text}`,
      status: 'uncertain',
      evidence: [
        {
          quote: text,
          source: 'Answer from departing member',
          chunk: 1,
          date: now().slice(0, 10),
        },
      ],
      visibility: original.visibility,
      review: { state: 'draft', by: null, at: null },
      nextAction: null,
      conflictsWith: [],
      inference: false,
    }

    setClaims((current) =>
      current.map((claim) => (claim.id === id ? replacement : claim))
    )
    log('Gap answered', `${short(question)} Answer: ${short(text)}`)
  }

  if (!user) {
    return <Login onLogin={handleLogin} />
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

        <ApprovalBar
          role={role}
          approval={approval}
          pendingCount={pendingCount}
          changedCount={changedCount}
          nextVersion={versions.length + 1}
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
              <GapQuestions questions={gaps} onAnswer={handleAnswer} />
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