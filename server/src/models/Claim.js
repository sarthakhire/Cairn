const { Schema, model } = require("mongoose");
const {
  CLAIM_TYPES,
  CLAIM_STATUSES,
  SENSITIVITY,
  REVIEW_STATES,
} = require("../constants");
const { hasVerifiedEvidence } = require("../services/verify");

const evidenceSchema = new Schema(
  {
    chunkId: { type: Schema.Types.ObjectId, ref: "Chunk", required: true },
    quote: { type: String, required: true }, // stored without the "..." wrapper
    quoteFound: { type: Boolean, required: true },
    supportsStatement: { type: Boolean, default: null }, // null = support check not run
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
    },
    nextAction: { type: String, default: null },
    conflictsWith: { type: [String], default: [] }, // claimIds
    inference: { type: Boolean, default: false },
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