const { Schema, model } = require("mongoose");
const {
  CLAIM_TYPES,
  CLAIM_STATUSES,
  SENSITIVITY,
  REVIEW_STATES,
} = require("../constants");
const { hasVerifiedEvidence } = require("../services/verify");

// Graded result from matchQuote (services/verify.js). null on claims made before Round 3.
const matchSchema = new Schema(
  {
    result: { type: String, enum: ["verified", "partial", "mismatch"], required: true },
    score: { type: Number, min: 0, max: 1, required: true },
    method: { type: String, enum: ["exact", "fuzzy", "none"], required: true },
    reason: { type: String, default: null },
    closest: { type: String, default: null },
  },
  { _id: false }
);

const evidenceSchema = new Schema(
  {
    chunkId: { type: Schema.Types.ObjectId, ref: "Chunk", required: true },
    quote: { type: String, required: true }, // stored without the "..." wrapper
    quoteFound: { type: Boolean, required: true },
    supportsStatement: { type: Boolean, default: null }, // null = support check not run
    match: { type: matchSchema, default: null },
  },
  { _id: false }
);

// One entry per review action, oldest first. Reviewer-only: never sent to incoming roles.
const historySchema = new Schema(
  {
    at: { type: Date, required: true },
    byId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: null }, // name at the time, so history survives a rename
    action: { type: String, enum: ["accept", "edit", "reject", "reopen"], required: true },
    fromState: { type: String, enum: REVIEW_STATES, required: true },
    toState: { type: String, enum: REVIEW_STATES, required: true },
    fromStatement: { type: String, required: true },
    toStatement: { type: String, required: true },
    reason: { type: String, default: null },
  },
  { _id: false }
);

// Why a claim whose quote does not match its source was accepted anyway.
const overrideSchema = new Schema(
  {
    reason: { type: String, required: true },
    byId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: null },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const claimSchema = new Schema(
  {
    claimId: { type: String, required: true, unique: true }, // "c_001", sent to the client as "id"
    type: { type: String, enum: CLAIM_TYPES, required: true },
    subject: { type: String, default: null, lowercase: true, trim: true }, // slug used for conflict detection
    statement: { type: String, required: true, trim: true },
    status: { type: String, enum: CLAIM_STATUSES, default: "uncertain" },
    baseStatus: { type: String, enum: CLAIM_STATUSES, default: "uncertain" }, // status before conflict flagging
    visibility: { type: String, enum: SENSITIVITY, required: true, index: true },
    evidence: { type: [evidenceSchema], default: [] },
    review: {
      state: { type: String, enum: REVIEW_STATES, default: "draft" },
      reviewerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
      reason: { type: String, default: null }, // why it was rejected (only while rejected)
      originalStatement: { type: String, default: null }, // wording before the first edit
      override: { type: overrideSchema, default: null },
      history: { type: [historySchema], default: [] },
    },
    nextAction: { type: String, default: null },
    conflictsWith: { type: [String], default: [] }, // claimIds
    inference: { type: Boolean, default: false },
    planted: { type: Boolean, default: false }, // synthetic demo claims; never sent to the API
  },
  { timestamps: true }
);

claimSchema.pre("validate", function () {
  if (this.status === "verified" && !hasVerifiedEvidence(this.evidence)) {
    this.invalidate(
      "status",
      "A claim cannot be verified without a quote found in its chunk that supports the statement"
    );
  }
});

module.exports = model("Claim", claimSchema);