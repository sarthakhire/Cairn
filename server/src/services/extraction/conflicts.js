const { CONTRADICT_SYSTEM, buildContradictPrompt } = require("./prompts");
const { ContradictSchema } = require("./schemas");
const { LlmOutputError } = require("../llm");

const MAX_GROUP = 6; // a bigger group means the model reused one slug too broadly; skip it

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Drafts are one tier only, so a conflict can never point across tiers
// (which would leak that a hidden claim exists). Claims are compared only when
// they share type and subject. Both claims of a contradicting pair become
// "conflicting"; their earlier status stays in baseStatus.
async function flagConflicts(drafts, generate) {
  const groups = new Map();
  for (const d of drafts) {
    if (!d.subject) continue;
    const key = d.type + "|" + d.subject;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  let pairs = 0;
  for (const group of groups.values()) {
    if (group.length < 2 || group.length > MAX_GROUP) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (norm(a.statement) === norm(b.statement)) continue;
        let contradicts = false;
        try {
          const out = await generate({
            system: CONTRADICT_SYSTEM,
            user: buildContradictPrompt(a.statement, b.statement),
            schema: ContradictSchema,
          });
          contradicts = out.contradicts;
        } catch (err) {
          if (!(err instanceof LlmOutputError)) throw err; // unusable answer: treat as no conflict
        }
        if (contradicts) {
          a.status = b.status = "conflicting";
          a.conflictsWith.push(b.key);
          b.conflictsWith.push(a.key);
          pairs++;
        }
      }
    }
  }
  return pairs;
}

module.exports = { flagConflicts };