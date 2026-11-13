const { Schema, model } = require("mongoose");

// One row per approval. Never updated after it is created, so a version
// is an exact record of what the reviewer approved.
const versionSchema = new Schema({
  number: { type: Number, required: true, unique: true },
  by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  byName: { type: String, required: true }, // name at the time, so history survives a rename
  at: { type: Date, required: true },
  // Every claim in the reviewer's view, in the API shape. Restricted text is in here,
  // so this must only ever be served through viewClaims() in permissions.js.
  claims: { type: Schema.Types.Mixed, required: true },
  summary: {
    total: Number,
    verified: Number,
    conflicts: Number,
    missing: Number,
    draft: Number,
  },
});

module.exports = model("Version", versionSchema);
