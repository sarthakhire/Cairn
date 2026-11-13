const { Schema, model } = require("mongoose");

// A single row (_id "handover") that says which version incoming roles may see.
// approvedVersion null means nothing is shared.
const handoverSchema = new Schema(
  {
    _id: String,
    approvedVersion: { type: Number, default: null },
    // { incoming_lead: { at, userId }, incoming_developer: { at, userId } }, cleared on every approve and revoke
    acknowledgements: { type: Schema.Types.Mixed, default: {} },
  },
  { minimize: false }
);

module.exports = model("Handover", handoverSchema);
