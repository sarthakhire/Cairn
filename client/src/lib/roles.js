export const ROLES = [
  { value: 'lead', label: 'Reviewer (Lead)' },
  { value: 'incoming_lead', label: 'Incoming lead' },
  { value: 'incoming_developer', label: 'Incoming developer' },
]

const APPROVED = ['accepted', 'edited']
const RESTRICTED_TEXT = 'Restricted: request access from reviewer'

export function claimsForRole(claims, role) {
  if (role === 'lead') return claims

  return claims
    .filter((claim) => {
      if (!APPROVED.includes(claim.review.state)) return false
      if (claim.visibility === 'lead_only') return role === 'incoming_lead'
      return true
    })
    .map((claim) =>
      claim.visibility === 'restricted'
        ? { ...claim, statement: RESTRICTED_TEXT, evidence: [], nextAction: null }
        : claim
    )
}

export function canReview(role) {
  return role === 'lead'
}