export const MASK = '[REDACTED]'

const CREDENTIAL_KEYED =
  /(?<![A-Za-z])(password|passwd|pwd|passcode|secret|api[ _-]?key|access[ _-]?key|token)(["']?(?:\s+is\s+|\s*[:=]\s*)["']?)([^\s,;"']+)/gi

const CREDENTIAL_SHAPED = /\b(?:sk-|ghp_|gho_|AKIA)[A-Za-z0-9_-]{12,}\b/g

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const PHONE_LONG = /(?:\+\d{1,3}[\s-]?)?\b\d{5}[\s-]?\d{5}\b/g
const PHONE_GROUPED = /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g

export function redact(input) {
  const counts = { credential: 0, email: 0, phone: 0 }
  let text = String(input)

  text = text.replace(CREDENTIAL_KEYED, (match, key, separator, value) => {
    if (value === MASK) return match
    counts.credential += 1
    return `${key}${separator}${MASK}`
  })

  text = text.replace(CREDENTIAL_SHAPED, () => {
    counts.credential += 1
    return MASK
  })

  text = text.replace(EMAIL, () => {
    counts.email += 1
    return MASK
  })

  for (const pattern of [PHONE_LONG, PHONE_GROUPED]) {
    text = text.replace(pattern, () => {
      counts.phone += 1
      return MASK
    })
  }

  const total = counts.credential + counts.email + counts.phone
  return { text, counts, total }
}

export function describeCounts(counts) {
  const parts = []
  if (counts.credential) {
    parts.push(`${counts.credential} credential${counts.credential > 1 ? 's' : ''}`)
  }
  if (counts.email) {
    parts.push(`${counts.email} email${counts.email > 1 ? 's' : ''}`)
  }
  if (counts.phone) {
    parts.push(`${counts.phone} phone number${counts.phone > 1 ? 's' : ''}`)
  }
  return parts.join(', ')
}