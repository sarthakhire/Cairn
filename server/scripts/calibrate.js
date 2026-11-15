// Calibration table for the fuzzy quote matcher. No database: it reads the demo notes in data/
// and grades labelled pairs with the real matcher, then shows how each PARTIAL_MIN would sort them.
// Run from server/:  node scripts/calibrate.js          (prints a summary)
//                    node scripts/calibrate.js --write  (also writes ../docs/verification-calibration.md, UTF-8)
const fs = require("node:fs");
const path = require("node:path");
const { matchQuote, PARTIAL_MIN } = require("../src/services/verify");

// Same cut as the notes importer: one chunk per heading section, numbered from 1.
function chunksOf(file) {
  const raw = fs
    .readFileSync(path.join(__dirname, "..", "..", "data", file), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
  return raw.replace(/^---\n[\s\S]*?\n---\n/, "").split(/^(?=#{1,6} )/m).map((s) => s.trim()).filter(Boolean);
}
const N1 = chunksOf("meeting-notes-01.md");
const N3 = chunksOf("meeting-notes-03.md");

// class: benign = should be accepted as partial; changed = a fact differs and should NOT be accepted;
//        notquote = not a quote of the cited chunk at all.
const PAIRS = [
  { id: "B1", cls: "benign", what: "one typo in a 16-word quote", chunk: N1[3], quote: "Decision: frontend will be React with Vit, fast to set up and everyone has used it." },
  { id: "B2", cls: "benign", what: "one extra word", chunk: N1[3], quote: "Decision: the frontend will be React with Vite, fast to set up and everyone has used it." },
  { id: "B3", cls: "benign", what: "one word dropped", chunk: N1[3], quote: "Decision: frontend will be React with Vite, fast to set up and everyone used it." },
  { id: "B4", cls: "benign", what: "punctuation removed", chunk: N1[3], quote: "Decision frontend will be React with Vite fast to set up and everyone has used it" },
  { id: "B5", cls: "benign", what: "two words swapped (React, Vite)", chunk: N1[3], quote: "Decision: frontend will be Vite with React, fast to set up and everyone has used it." },
  { id: "B6", cls: "benign", what: "typo in a 7-word quote", chunk: N1[5], quote: "Riya: set up the repositry and CI." },
  { id: "B7", cls: "benign", what: "typo in a 5-word quote", chunk: N1[4], quote: "Look for free hostng first." },
  { id: "C1", cls: "changed", what: "technology swapped (Angular), no number or negation", chunk: N1[3], quote: "Decision: frontend will be Angular with Vite, fast to set up and everyone has used it." },
  { id: "C2", cls: "changed", what: "owner swapped (Karan), 7-word quote", chunk: N1[5], quote: "Karan: set up the repository and CI." },
  { id: "C3", cls: "changed", what: "owner swapped (Karan), 12-word quote", chunk: N3[2], quote: "Decision: going with Postgres, the reporting queries need joins. Karan will write the schema." },
  { id: "C4", cls: "changed", what: "name misspelled into another name, 5 words", chunk: N1[1], quote: "Meera (lead), Riya, Karen, Aman." },
  { id: "C5", cls: "changed", what: "number the source does not contain", chunk: N3[2], quote: "Decision: going with Postgres 14, the reporting queries need joins." },
  { id: "C6", cls: "changed", what: "negation inserted", chunk: N1[3], quote: "Decision: frontend will not be React with Vite, fast to set up and everyone has used it." },
  { id: "N1", cls: "notquote", what: "paraphrase of a real sentence", chunk: N3[2], quote: "we picked Postgres because the reports need joins" },
  { id: "N2", cls: "notquote", what: "invented sentence about hosting", chunk: N1[4], quote: "Decision: the club approved a paid hosting plan with a monthly budget." },
  { id: "N3", cls: "notquote", what: "real quote cited against the wrong chunk", chunk: N1[5], quote: "Look for free hosting first. Riya will check the options and report back." },
  { id: "N4", cls: "notquote", what: "different task described for the same people", chunk: N3[2], quote: "Aman will design the schema and the first migration" },
];

const guardStopped = (g) => /number differs|negation differs/.test(g.reason || "");
const rows = PAIRS.map((p) => ({ ...p, g: matchQuote(p.quote, p.chunk, { supportsStatement: true }) }));
const accepted = (r, t) => r.g.method === "fuzzy" && !guardStopped(r.g) && r.g.score >= t;

const out = [];
out.push(`Pairs graded by matchQuote (current PARTIAL_MIN = ${PARTIAL_MIN}). Synthetic pairs built from the demo notes.`, "");
out.push("| id | class | case | result | method | score | reason |", "|---|---|---|---|---|---|---|");
for (const r of rows) {
  out.push(`| ${r.id} | ${r.cls} | ${r.what} | ${r.g.result} | ${r.g.method} | ${r.g.score.toFixed(3)} | ${r.g.reason || ""} |`);
}
out.push("", "How each threshold would sort the pairs (guards apply at every threshold):", "");
out.push("| PARTIAL_MIN | benign accepted | changed fact accepted | not-a-quote accepted |", "|---|---|---|---|");
const count = (cls, t) => rows.filter((r) => r.cls === cls && accepted(r, t)).length;
const total = (cls) => rows.filter((r) => r.cls === cls).length;
for (const t of [0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
  out.push(`| ${t.toFixed(2)} | ${count("benign", t)} of ${total("benign")} | ${count("changed", t)} of ${total("changed")} | ${count("notquote", t)} of ${total("notquote")} |`);
}
const text = out.join("\n") + "\n";
console.log(text);
if (process.argv.includes("--write")) {
  const dir = path.join(__dirname, "..", "..", "docs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "verification-calibration.md"), text, "utf8");
  console.log("Wrote docs/verification-calibration.md");
}