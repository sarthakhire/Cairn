import { useState } from 'react'
import initialClaims from '@/mock/claims.json'
import ClaimCard from '@/components/ClaimCard'
import FilterBar from '@/components/FilterBar'
import EvidenceDrawer from '@/components/EvidenceDrawer'

function App() {
  const [claims, setClaims] = useState(initialClaims)
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const visibleClaims = claims.filter(
    (claim) =>
      (status === 'all' || claim.status === status) &&
      (type === 'all' || claim.type === type)
  )

  const selectedClaim = claims.find((claim) => claim.id === selectedId) ?? null

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
      <header className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">
          Handover<span className="font-serif text-2xl italic">Trail</span>
        </h1>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <FilterBar
          status={status}
          type={type}
          onStatusChange={setStatus}
          onTypeChange={setType}
        />

        <p className="text-xs text-muted-foreground">
          Showing {visibleClaims.length} of {claims.length} claims
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
        allClaims={claims}
        onClose={() => setSelectedId(null)}
        onReview={handleReview} 
        onEdit={handleEdit}
        
      />
    </div>
  )
}

export default App