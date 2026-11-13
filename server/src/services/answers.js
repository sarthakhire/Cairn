const Claim = require("../models/Claim");
const Chunk = require("../models/Chunk");
const Source = require("../models/Source");
const { nextClaimId } = require("./ids");
const { redact } = require("./redact");

class AnswerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// The question shown for a gap. Same wording as client/src/lib/gaps.js.
const questionFor = (claim) => (claim.status === "missing" ? claim.statement : "Is this correct? " + claim.statement);

// Open questions are claims the sources could not settle. Restricted ones are never asked.
const isOpenQuestion = (claim) =>
  claim.visibility !== "restricted" && (claim.status === "missing" || (claim.inference && claim.status === "uncertain"));

const sourceNameFor = (visibility) =>
  visibility === "team" ? "Answer from departing member" : "Answer from departing member (lead only)";

// Stores the answer as a chunk of an "informal" source of the same tier, so it can
// never reach "verified" on its own and is only visible to roles that may see that tier.
async function saveAnswerChunk({ visibility, text, user }) {
  const name = sourceNameFor(visibility);
  const source = await Source.findOneAndUpdate(
    { name },
    { $setOnInsert: { kind: "notes", sensitivity: visibility, formality: "informal", uploadedBy: user.id } },
    { upsert: true, returnDocument: "after" }
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await Chunk.findOne({ sourceId: source._id }).sort({ n: -1 }).select("n").lean();
    const n = last ? last.n + 1 : 1;
    try {
      return await Chunk.create({
        sourceId: source._id,
        sensitivity: visibility,
        n,
        ref: name + "#" + n,
        text,
        author: user.name || null,
        timestamp: new Date(),
      });
    } catch (err) {
      if (err.code !== 11000) throw err; // two answers at once took the same number: try the next one
    }
  }
  throw new AnswerError(409, "Could not save the answer, try again");
}

// Replaces an open question with a new draft claim that carries the answer.
async function answerGap({ claimId, answer, user }) {
  const original = await Claim.findOne({ claimId }).lean();
  if (!original) throw new AnswerError(404, "Not found");
  if (!isOpenQuestion(original)) throw new AnswerError(400, "This claim is not an open question");

  const cleaned = redact(answer);
  const text = cleaned.text.trim();
  if (!text) throw new AnswerError(400, "The answer is empty");

  const question = questionFor(original);
  const chunk = await saveAnswerChunk({ visibility: original.visibility, text, user });
  const newId = await nextClaimId();
  await Claim.create({
    claimId: newId,
    type: original.type,
    subject: original.subject || null,
    statement: question + " Answer: " + text,
    status: "uncertain",
    baseStatus: "uncertain",
    visibility: original.visibility,
    evidence: [{ chunkId: chunk._id, quote: text, quoteFound: true, supportsStatement: null }],
    review: { state: "draft", reviewerId: null, at: null },
    nextAction: null,
    conflictsWith: [],
    inference: false,
  });
  // Only after the new claim exists, so a failure can never lose the question.
  await Claim.deleteOne({ claimId });

  return { newId, oldId: claimId, question, text, original, redacted: { ...cleaned.counts, total: cleaned.total } };
}

module.exports = { AnswerError, answerGap, isOpenQuestion, questionFor, sourceNameFor };
