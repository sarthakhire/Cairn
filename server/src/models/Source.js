const { Schema, model } = require("mongoose");
const { SOURCE_KINDS, SENSITIVITY, FORMALITY } = require("../constants");

const sourceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true }, // file name, shown as "source" in the UI // file name, shown as "source" in the UI
    kind: { type: String, enum: SOURCE_KINDS, required: true },
    sensitivity: { type: String, enum: SENSITIVITY, required: true },
    formality: { type: String, enum: FORMALITY, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // What was masked before the text was stored: { credential, email, phone, total }.
    // null for restricted sources, which are stored as written.
    redactions: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = model("Source", sourceSchema);