import { useState } from 'react'
import initialClaims from '@/mock/claims.json'
import ClaimCard from '@/components/ClaimCard'
import FilterBar from '@/components/FilterBar'
import EvidenceDrawer from '@/components/EvidenceDrawer'
import RoleSwitcher from '@/components/RoleSwitcher'
import { claimsForRole, canReview } from '@/lib/roles'

function App() {
  const [claims, setClaims] = useState(initialClaims)
  const [role, setRole] = useState('lead')
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
          {visibleClaims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} onSelect={setSelectedId} />
          ))}
          {visibleClaims.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No claims match these filters.
            </p>
          )}
        </div>
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