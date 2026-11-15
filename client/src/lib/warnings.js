// Counts the things that do not block approval but a reviewer should know about.
// Rejected claims are left out: they are not part of what the successor receives.
export function countWarnings(claims) {
  const live = (claims ?? []).filter((claim) => claim.review?.state !== 'rejected')
  return {
    partial: live.filter((claim) => claim.verification === 'partial').length,
    uncertain: live.filter((claim) => claim.status === 'uncertain').length,
    missing: live.filter((claim) => claim.status === 'missing').length,
    conflicting: live.filter((claim) => claim.status === 'conflicting').length,
  }
}

export function totalWarnings(warnings) {
  if (!warnings) return 0
  return warnings.partial + warnings.uncertain + warnings.missing + warnings.conflicting
}
