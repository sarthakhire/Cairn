const { parseDate, pushChunks } = require("./util");

// Optional front matter at the top of a notes file:
//   ---
//   date: 2026-02-03
//   author: Meera
//   ---
// Only "date" and "author" are read. No YAML library needed.
function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z_]+)\s*:\s*(.*?)\s*$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
}

// One chunk per heading section (heading line included, so quotes can match it).
// Text before the first heading is its own chunk. A heading with no body is skipped.
// A date in the heading ("## 2026-02-21 #general") overrides the front-matter date.
function parseNotes(text, filename) {
  const clean = String(text).replace(/^\uFEFF/, "");
  const { meta, body } = parseFrontMatter(clean);
  const fileDate = parseDate(meta.date);

  const sections = [];
  let cur = { heading: null, lines: [] };
  let fence = null; // inside a ``` or ~~~ block, "#" lines are code comments, not headings

  for (const line of body.split(/\r?\n/)) {
    const f = line.match(/^\s*(```|~~~)/);
    if (f) fence = fence ? (f[1] === fence ? null : fence) : f[1];
    const isHeading = !fence && !f && /^#{1,6}\s+\S/.test(line);
    if (isHeading) {
      sections.push(cur);
      cur = { heading: line.trim(), lines: [line] };
    } else {
      cur.lines.push(line);
    }
  }
  sections.push(cur);

  const chunks = [];
  for (const s of sections) {
    const content = (s.heading ? s.lines.slice(1) : s.lines).join("\n").trim();
    if (!content) continue;
    const headingDate = s.heading ? parseDate((s.heading.match(/\d{4}-\d{2}-\d{2}/) || [])[0]) : null;
    pushChunks(chunks, filename, s.lines.join("\n"), {
      author: meta.author,
      timestamp: headingDate || fileDate,
    });
  }
  return chunks;
}

module.exports = { parseNotes, parseFrontMatter };