import { useState } from 'react'
import initialClaims from '@/mock/claims.json'
import ClaimCard from '@/components/ClaimCard'
import FilterBar from '@/components/FilterBar'
import EvidenceDrawer from '@/components/EvidenceDrawer'
import RoleSwitcher from '@/components/RoleSwitcher'
import FirstWeekPlan from '@/components/FirstWeekPlan'
import ConflictResolver from '@/components/ConflictResolver'
import StatsRow from '@/components/StatsRow'
import Hero from '@/components/Hero'
import { claimsForRole, canReview } from '@/lib/roles'

function App() {
  const [claims, setClaims] = useState(initialClaims)
  const [resolutions, setResolutions] = useState([])
  const [role, setRole] = useState('lead')
  const [view, setView] = useState('claims')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const roleClaims = claimsForRole(claims, role)

  const views = [
    { value: 'claims', label: 'Claims' },
    { value: 'plan', label: 'First-week plan' },
    ...(role === 'lead' ? [{ value: 'conflicts', label: 'Conflicts' }] : []),
  ]
  const activeView = views.some((item) => item.value === view) ? view : 'claims'

  const visibleClaims = roleClaims.filter(
    (claim) =>
      (status === 'all' || claim.status === status) &&
      (type === 'all' || claim.type === type)
  )

  const selectedClaim = roleClaims.find((claim) => claim.id === selectedId) ?? null

  function handleReview(id, state) {
    const at = new Date().toISOString().slice(0, 19)
    setClaims((current) =>
      current.map((claim) =>
        claim.id === id
          ? { ...claim, review: { state, by: 'Lead', at } }
          : claim
      )
    )
  }

  function handleEdit(id, statement) {
    const at = new Date().toISOString().slice(0, 19)
    setClaims((current) =>
      current.map((claim) =>
        claim.id === id
          ? { ...claim, statement, review: { state: 'edited', by: 'Lead', at } }
          : claim
      )
    )
  }

  function handleResolve(keepId, dropId) {
    const at = new Date().toISOString().slice(0, 19)
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
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">
          Handover<span className="font-serif text-2xl italic">Trail</span>
        </h1>
        <RoleSwitcher role={role} onChange={setRole} />
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <Hero />
        <StatsRow claims={roleClaims} />

        <div className="flex gap-4 border-b">
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