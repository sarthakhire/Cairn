const Chunk = require("../../models/Chunk");
const Claim = require("../../models/Claim");
const AuditLog = require("../../models/AuditLog");
const { nextClaimId } = require("../ids");
const { verifyQuote } = require("../verify");
const { generateJson, LlmOutputError } = require("../llm");
const { SENSITIVITY, CLAIM_TYPES } = require("../../constants");
const { assignStatus } = require("./status");
const { flagConflicts } = require("./conflicts");
const { BatchSchema, SupportSchema } = require("./schemas");
const {
  EXTRACT_SYSTEM,
  SUPPORT_SYSTEM,
  MAX_CHUNK_CHARS,
  buildExtractionPrompt,
  buildSupportPrompt,
} = require("./prompts");

const MAX_BATCH_CHARS = 20000;

class ExtractionFailed extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dupKey = (visibility, type, statement) => visibility + "|" + type + "|" + norm(statement);

const cleanQuote = (q) =>
  String(q ?? "").trim().replace(/^(?:\.{3,}|\u2026)\s*/, "").replace(/\s*(?:\.{3,}|\u2026)$/, "").trim();

const slug = (s) =>
  s ? s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || null : null;

// Keeps each prompt under a size budget. Labels (C1, C2, ...) restart per batch.
function splitBatches(chunks) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const c of chunks) {
    const len = Math.min(c.text.length, MAX_CHUNK_CHARS) + 120;
    if (current.length && size + len > MAX_BATCH_CHARS) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(c);
    size += len;
  }
  if (current.length) batches.push(current);
  return batches;
}

// One model call per (batch, type). Only chunks of this one tier go in.
async function collectCandidates({ tier, chunks, types, generate, asOf, log }) {
  const candidates = [];
  let skippedBatches = 0;

  for (const batch of splitBatches(chunks)) {
    const labelled = new Map(batch.map((c, i) => ["C" + (i + 1), c]));
    for (const type of types) {
      let out;
      try {
        out = await generate({
          system: EXTRACT_SYSTEM,
          user: buildExtractionPrompt({ type, chunks: batch, asOf }),
          schema: BatchSchema,
        });
      } catch (err) {
        if (!(err instanceof LlmOutputError)) throw err;
        skippedBatches++;
        log("Skipped a batch (" + tier + ", " + type + "): " + err.message);
        continue;
      }
      for (const item of out.claims) {
        const label = String(item.chunk || "").trim().toUpperCase();
        candidates.push({ tier, type, item, chunk: labelled.get(label) || null });
      }
    }
  }
  return { candidates, skippedBatches };
}

// Asks the second question: does this quote really support this statement?
// null means the check could not run, which is never treated as a yes.
async function checkSupport({ statement, quote }, generate) {
  try {
    const out = await generate({
      system: SUPPORT_SYSTEM,
      user: buildSupportPrompt({ statement, quote }),
      schema: SupportSchema,
    });
    return out.supports;
  } catch (err) {
    if (err instanceof LlmOutputError) return null;
    throw err;
  }
}

// Verifies quotes, runs the support check, assigns status, flags conflicts.
// Returns drafts in memory only. Nothing is saved here.
async function finalizeTier(candidates, generate) {
  const seen = new Set();
  const drafts = [];
  let dropped = 0;

  for (const { tier, type, item, chunk } of candidates) {
    const dk = type + "|" + norm(item.statement);
    if (seen.has(dk)) continue;
    seen.add(dk);

    const quote = cleanQuote(item.quote);
    const hasQuote = quote.length > 0;
    const quoteFound = !!chunk && hasQuote && verifyQuote(quote, chunk.text);
    const supportsStatement = quoteFound ? await checkSupport({ statement: item.statement, quote }, generate) : null;

    const status = assignStatus({
      type,
      hasQuote,
      chunkFound: !!chunk,
      quoteFound,
      formality: chunk && chunk.sourceId ? chunk.sourceId.formality : null,
      supportsStatement,
    });
    if (status === null) {
      dropped++;
      continue;
    }

    drafts.push({
      key: tier + "#" + drafts.length, // unique across tiers, so conflict links can never cross a tier
      tier,
      type,
      subject: slug(item.subject),
      statement: item.statement,
      status,
      baseStatus: status,
      evidence: chunk && hasQuote ? [{ chunkId: chunk._id, quote, quoteFound, supportsStatement }] : [],
      nextAction: item.nextAction,
      // A claim with no quote, or a chunk label that does not exist, is by definition an inference.
      inference: item.inference || !chunk || !hasQuote,
      conflictsWith: [],
    });
  }

  const conflictPairs = await flagConflicts(drafts, generate);
  return { drafts, dropped, conflictPairs };
}

const loadTier = (tier) =>
  Chunk.find({ sensitivity: tier })
    .populate("sourceId", "name formality createdAt")
    .sort({ sourceId: 1, n: 1 })
    .lean();

// Runs every tier and type, then replaces the old drafts with the new ones.
// Reviewed claims (accepted, edited, rejected) are never touched.
async function runExtraction({
  actorId,
  generate = generateJson,
  tiers = SENSITIVITY,
  types = CLAIM_TYPES,
  asOf = process.env.EXTRACTION_AS_OF || null,
  log = console.warn,
} = {}) {
  const all = [];
  let skippedBatches = 0;
  let dropped = 0;
  let chunkTotal = 0;

  for (const tier of tiers) {
    // The filter is repeated in code so a wrong query can never mix tiers.
    const chunks = (await loadTier(tier)).filter((c) => c.sensitivity === tier);
    chunkTotal += chunks.length;
    if (chunks.length === 0) continue;

    const collected = await collectCandidates({ tier, chunks, types, generate, asOf, log });
    skippedBatches += collected.skippedBatches;
    const done = await finalizeTier(collected.candidates, generate);
    dropped += done.dropped;
    all.push(...done.drafts);
  }

  if (chunkTotal === 0) throw new ExtractionFailed("No source chunks yet. Upload sources first.", 422);
  if (all.length === 0 && skippedBatches > 0) {
    throw new ExtractionFailed("The AI model returned no usable output. Existing drafts were kept.", 502);
  }

  // Swap only now, so a failed run never wipes the existing drafts.
  const removed = await Claim.deleteMany({ "review.state": "draft" });
  const existing = await Claim.find({}).select("type visibility statement").lean();
  const existingKeys = new Set(existing.map((c) => dupKey(c.visibility, c.type, c.statement)));

  const kept = [];
  const idByKey = new Map();
  let duplicatesSkipped = 0;
  for (const d of all) {
    if (existingKeys.has(dupKey(d.tier, d.type, d.statement))) {
      duplicatesSkipped++;
      continue;
    }
    d.claimId = await nextClaimId();
    idByKey.set(d.key, d.claimId);
    kept.push(d);
  }

  const stats = { verified: 0, uncertain: 0, conflicting: 0, missing: 0 };
  const perTier = Object.fromEntries(SENSITIVITY.map((t) => [t, { claims: 0, verified: 0 }]));
  let quotesNotFound = 0;

  for (const d of kept) {
    const conflictsWith = d.conflictsWith.map((k) => idByKey.get(k)).filter(Boolean);
    const status = conflictsWith.length ? "conflicting" : d.baseStatus; // partner may have been a duplicate
    await Claim.create({
      claimId: d.claimId,
      type: d.type,
      subject: d.subject,
      statement: d.statement,
      status,
      baseStatus: d.baseStatus,
      visibility: d.tier, // the claim inherits the tier of the chunks it was extracted from
      evidence: d.evidence,
      review: { state: "draft" },
      nextAction: d.nextAction,
      conflictsWith,
      inference: d.inference,
    });
    stats[status]++;
    perTier[d.tier].claims++;
    if (status === "verified") perTier[d.tier].verified++;
    if (d.evidence.some((e) => !e.quoteFound)) quotesNotFound++;
  }

  const summary = {
    claimsCreated: kept.length,
    ...stats,
    evidenceCoverage: kept.length ? Math.round((stats.verified / kept.length) * 100) / 100 : 0,
    quotesNotFound,
    dropped,
    duplicatesSkipped,
    skippedBatches,
    draftsReplaced: removed.deletedCount || 0,
    perTier,
  };
  await AuditLog.create({ actorId, action: "extract", claimId: null, before: { draftsRemoved: summary.draftsReplaced }, after: summary });
  return summary;
}

module.exports = {
  runExtraction,
  collectCandidates,
  finalizeTier,
  splitBatches,
  cleanQuote,
  ExtractionFailed,
};