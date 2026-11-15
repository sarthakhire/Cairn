// Word-level comparison of a claimed quote and the closest passage in its source.
// Case and punctuation at the edges of a word are ignored, so "Hello," equals "hello".

const edge = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu
const norm = (word) => word.toLowerCase().replace(edge, '')
const words = (text) => String(text ?? '').split(/\s+/).filter(Boolean)

// Quotes in the API are wrapped in "..." . Those dots are not part of the source text.
export function stripEdgeEllipsis(text) {
  return String(text ?? '')
    .replace(/^(?:\.{3,}|\u2026)\s*/, '')
    .replace(/\s*(?:\.{3,}|\u2026)$/, '')
    .trim()
}

// Returns { left, right }: each is a list of { text, changed } in reading order.
export function diffWords(leftText, rightText) {
  const a = words(leftText)
  const b = words(rightText)
  const na = a.map(norm)
  const nb = b.map(norm)

  // table[i][j] = length of the longest common run of words from a[i..] and b[j..]
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        na[i] === nb[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const left = []
  const right = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (na[i] === nb[j]) {
      left.push({ text: a[i], changed: false })
      right.push({ text: b[j], changed: false })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      left.push({ text: a[i], changed: true })
      i += 1
    } else {
      right.push({ text: b[j], changed: true })
      j += 1
    }
  }
  for (; i < a.length; i += 1) left.push({ text: a[i], changed: true })
  for (; j < b.length; j += 1) right.push({ text: b[j], changed: true })

  return { left, right }
}