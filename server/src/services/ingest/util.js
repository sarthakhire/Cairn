// Shared helpers for the importers. Nothing here touches the database.

const MAX_CHUNK_CHARS = 3000;

// Thrown for problems with the uploaded file itself (bad JSON, missing column...).
// The upload route turns these into a 422 with the message.
class IngestError extends Error {
  constructor(message) {
    super(message);
    this.name = "IngestError";
  }
}

// Accepts only ISO-style dates ("2026-02-03", "2026-02-03T10:00:00Z", "2026-02-03 10:00").
// A date-time with no zone is treated as UTC so the result does not depend on the
// server's time zone. Anything else returns null instead of guessing.
function parseDate(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return null;
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += "Z";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Splits long text on blank lines so no chunk is much bigger than `max`.
// A single paragraph longer than `max` is cut at a space where possible.
// A quote that straddles a cut will not verify, which is the safe direction.
function splitLong(text, max = MAX_CHUNK_CHARS) {
  const t = String(text).trim();
  if (!t) return [];
  if (t.length <= max) return [t];

  const out = [];
  let cur = "";
  for (const para of t.split(/\n\s*\n/)) {
    let p = para.trim();
    if (!p) continue;
    while (p.length > max) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      let cut = p.lastIndexOf(" ", max);
      if (cut < max * 0.5) cut = max;
      out.push(p.slice(0, cut).trim());
      p = p.slice(cut).trim();
    }
    if (!p) continue;
    if (cur && cur.length + 2 + p.length > max) {
      out.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Adds one or more chunks (more than one only if the text had to be split).
// n is 1-based and counts every chunk in the file; ref is "filename#n".
function pushChunks(chunks, filename, text, meta = {}) {
  for (const piece of splitLong(text)) {
    const n = chunks.length + 1;
    chunks.push({
      n,
      ref: filename + "#" + n,
      text: piece,
      author: meta.author || null,
      timestamp: meta.timestamp || null,
      link: meta.link || null,
    });
  }
}

module.exports = { MAX_CHUNK_CHARS, IngestError, parseDate, splitLong, pushChunks };