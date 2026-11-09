const STATUS_ORDER = { missing: 0, conflicting: 1, uncertain: 2, verified: 3 }

export function buildPlan(claims) {
  return claims
    .filter((claim) => claim.nextAction)
    .sort((a, b) => {
      const aRisk = a.type === 'risk_dependency' ? 0 : 1
      const bRisk = b.type === 'risk_dependency' ? 0 : 1
      if (aRisk !== bRisk) return aRisk - bRisk
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    })
}