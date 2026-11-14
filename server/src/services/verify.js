const MIN_QUOTE_LENGTH = 15;

function normalise(t) {
  return String(t)
    .normalize("NFKC") // also turns the single "…" character into "..."
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Models (and the mock data) wrap excerpts in "..." . Those dots are not part
// of the source text, so remove them before matching. Dots in the middle of a
// quote are kept, which means a quote with an elided middle fails (fail closed).
function stripEdgeEllipsis(t) {
  return t.replace(/^(?:\.{3,}\s*)+/, "").replace(/(?:\s*\.{3,})+$/, "");
}

function verifyQuote(quote, chunkText) {
  if (typeof quote !== "string" || typeof chunkText !== "string") return false;
  const core = stripEdgeEllipsis(normalise(quote));
  if (core.length < MIN_QUOTE_LENGTH) return false; // too short to mean anything
  return normalise(chunkText).includes(core);
}

// The contract rule: a claim may be "verified" only if at least one evidence
// item has a quote found in its chunk AND the support check said yes.
// If you cut the support-check call (see "If you fall behind"), set
// supportsStatement to true from the reviewer flag instead of loosening this.
function hasVerifiedEvidence(evidence) {
  return (evidence || []).some(
    (e) => e && e.quoteFound === true && e.supportsStatement === true
  );
}

// ---------------------------------------------------------------------------
// Round 3: graded matching. verifyQuote and hasVerifiedEvidence above are the
// Round 2 baseline and stay as they are.
// ---------------------------------------------------------------------------

// GUESS values. PARTIAL_MIN is calibrated in step S1.10 (docs/verification.md).
const PARTIAL_MIN = 0.85; // fuzzy similarity at or above this is "partial"
const WINDOW_LOW = 0.8; // matched passage may be 80% ...
const WINDOW_HIGH = 1.2; // ... to 120% of the quote's length, in words
const CLOSEST_MIN = 0.5; // below this there is no "close" passage worth showing
const MAX_CLOSEST_CHARS = 400;

const NEGATION_WORDS = new Set(["not", "no", "never", "cannot", "without"]);

// Same clean-up as normalise() but keeps the original letter case, so the
// passage shown to the reviewer reads naturally.
function lightNormalise(t) {
  return String(t)
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Words (letters and digits, with inner apostrophes so "don't" stays one word)
// with their positions in the text.
function tokenise(text) {
  const out = [];
  const re = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function negationCount(words) {
  return words.filter((w) => NEGATION_WORDS.has(w) || w.endsWith("n't")).length;
}

// Best approximate match of the quote words inside the chunk words
// (Sellers' algorithm: edit distance against any stretch of the chunk).
// Returns the word range [start, end) with the lowest distance.
function bestWindow(q, c) {
  const n = q.length;
  const m = c.length;
  let prevD = new Int32Array(m + 1); // row 0: a match may start anywhere, cost 0
  let prevS = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) prevS[j] = j;
  let curD = new Int32Array(m + 1);
  let curS = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    curD[0] = i;
    curS[0] = 0;
    for (let j = 1; j <= m; j++) {
      const diag = prevD[j - 1] + (q[i - 1] === c[j - 1] ? 0 : 1);
      const up = prevD[j] + 1;
      const left = curD[j - 1] + 1;
      if (diag <= up && diag <= left) {
        curD[j] = diag;
        curS[j] = prevS[j - 1];
      } else if (up <= left) {
        curD[j] = up;
        curS[j] = prevS[j];
      } else {
        curD[j] = left;
        curS[j] = curS[j - 1];
      }
    }
    [prevD, curD] = [curD, prevD];
    [prevS, curS] = [curS, prevS];
  }
  let bestJ = 1;
  for (let j = 1; j <= m; j++) if (prevD[j] < prevD[bestJ]) bestJ = j;
  return { dist: prevD[bestJ], start: prevS[bestJ], end: bestJ };
}

function clip(text) {
  return text.length <= MAX_CLOSEST_CHARS ? text : text.slice(0, MAX_CLOSEST_CHARS - 3) + "...";
}

/**
 * Grade one quote against the ONE chunk it cites. Never looks anywhere else,
 * so a closest passage can never leak text from a more sensitive source.
 *
 * Returns { result: "verified"|"partial"|"mismatch", score: 0..1,
 *           method: "exact"|"fuzzy"|"none", reason: string|null,
 *           closest: string|null }
 *
 * Only an exact match with supportsStatement === true can be "verified".
 */
function matchQuote(quote, chunkText, { supportsStatement } = {}) {
  const out = (result, score, method, reason, closest = null) => ({
    result,
    score: Math.round(score * 1000) / 1000,
    method,
    reason,
    closest,
  });

  const core = stripEdgeEllipsis(normalise(typeof quote === "string" ? quote : ""));
  if (core.length < MIN_QUOTE_LENGTH) return out("mismatch", 0, "none", "quote too short");
  if (typeof chunkText !== "string" || !chunkText.trim()) {
    return out("mismatch", 0, "none", "cited source text not available");
  }

  // 1. Exact (normalised) match.
  if (normalise(chunkText).includes(core)) {
    if (supportsStatement === true) return out("verified", 1, "exact", null);
    if (supportsStatement === false) {
      return out("mismatch", 1, "exact", "quote found but does not support the statement");
    }
    return out("partial", 1, "exact", "support check not run");
  }

  // 2. Fuzzy match inside the cited chunk only.
  const text = lightNormalise(chunkText);
  const cTok = tokenise(text);
  const qWords = tokenise(stripEdgeEllipsis(lightNormalise(quote))).map((t) => t.w);
  if (qWords.length === 0 || cTok.length === 0) {
    return out("mismatch", 0, "none", "no close passage in the cited source");
  }
  const { dist, start, end } = bestWindow(qWords, cTok.map((t) => t.w));
  const wLen = end - start;
  const score = wLen === 0 ? 0 : Math.max(0, 1 - dist / Math.max(qWords.length, wLen));
  if (score < CLOSEST_MIN) {
    return out("mismatch", score, "none", "no close passage in the cited source");
  }

  const windowWords = cTok.slice(start, end).map((t) => t.w);
  const closest = clip(text.slice(cTok[start].start, cTok[end - 1].end));

  // Guards run before any score is accepted: a high score cannot rescue a
  // changed number or a flipped negation.
  const windowSet = new Set(windowWords);
  const numbers = qWords.filter((w) => /\d/.test(w));
  if (numbers.some((w) => !windowSet.has(w))) {
    return out("mismatch", score, "fuzzy", "number differs", closest);
  }
  if (negationCount(qWords) % 2 !== negationCount(windowWords) % 2) {
    return out("mismatch", score, "fuzzy", "negation differs", closest);
  }

  const inBand =
    wLen >= Math.floor(WINDOW_LOW * qWords.length) && wLen <= Math.ceil(WINDOW_HIGH * qWords.length);
  if (inBand && score >= PARTIAL_MIN) {
    return out("partial", score, "fuzzy", `wording differs from the source (similarity ${score.toFixed(2)})`, closest);
  }
  return out("mismatch", score, "fuzzy", `closest passage is too different (similarity ${score.toFixed(2)})`, closest);
}

module.exports = {
  verifyQuote,
  hasVerifiedEvidence,
  matchQuote,
  MIN_QUOTE_LENGTH,
  PARTIAL_MIN,
  WINDOW_LOW,
  WINDOW_HIGH,
  CLOSEST_MIN,
  MAX_CLOSEST_CHARS,
};