const Counter = require("../models/Counter");

const formatClaimId = (seq) => "c_" + String(seq).padStart(3, "0");

// Atomic counter, so two claims created at once never get the same id.
async function nextClaimId() {
  const counter = await Counter.findOneAndUpdate(
    { _id: "claim" },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true }
  );
  return formatClaimId(counter.seq);
}

module.exports = { nextClaimId, formatClaimId };