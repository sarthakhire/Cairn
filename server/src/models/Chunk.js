const { Schema, model } = require("mongoose");
const { SENSITIVITY } = require("../constants");

const chunkSchema = new Schema({
  sourceId: { type: Schema.Types.ObjectId, ref: "Source", required: true },
  sensitivity: { type: String, enum: SENSITIVITY, required: true, index: true }, // copied from its source
  n: { type: Number, required: true }, // position in the source, becomes "chunk" in the contract
  ref: { type: String, required: true }, // e.g. "meeting-notes-01.md#4"
  text: { type: String, required: true },
  author: { type: String, default: null },
  timestamp: { type: Date, default: null }, // falls back to the source's createdAt when null
  link: { type: String, default: null },
});

chunkSchema.index({ sourceId: 1, n: 1 }, { unique: true });

module.exports = model("Chunk", chunkSchema);