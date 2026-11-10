export function findGaps(claims) {
  return claims.filter(
    (claim) =>
      claim.visibility !== 'restricted' &&
      (claim.status === 'missing' ||
        (claim.inference && claim.status === 'uncertain'))
  )
}

export function questionFor(claim) {
  return claim.status === 'missing'
    ? claim.statement
    : `Is this correct? ${claim.statement}`
}