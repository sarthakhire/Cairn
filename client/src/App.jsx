import { useState } from 'react'
import initialClaims from '@/mock/claims.json'
import ClaimCard from '@/components/ClaimCard'
import FilterBar from '@/components/FilterBar'
import EvidenceDrawer from '@/components/EvidenceDrawer'
import RoleSwitcher from '@/components/RoleSwitcher'
import FirstWeekPlan from '@/components/FirstWeekPlan'
import StatsRow from '@/components/StatsRow'
import Hero from '@/components/Hero'  
import { claimsForRole, canReview } from '@/lib/roles'

const VIEWS = [
  { value: 'claims', label: 'Claims' },
  { value: 'plan', label: 'First-week plan' },
]

function App() {
  const [claims, setClaims] = useState(initialClaims)
  const [role, setRole] = useState('lead')
  const [view, setView] = useState('claims')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const roleClaims = claimsForRole(claims, role)

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
          {VIEWS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setView(item.value)}
              aria-pressed={view === item.value}
              className={`-mb-px border-b-2 px-1 pb-2 text-sm transition-colors ${
                view === item.value
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {view === 'claims' ? (
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
        ) : (
          <FirstWeekPlan claims={roleClaims} onSelect={setSelectedId} />
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