const Claim = require("../models/Claim");
const { serializeClaim } = require("./serializer");

// Chunk text is deliberately not selected: the API only needs n, date and source name.
const POPULATE = [
  { path: "review.reviewerId", select: "name" },
  {
    path: "evidence.chunkId",
    select: "n timestamp sourceId",
    populate: { path: "sourceId", select: "name createdAt" },
  },
];

const load = (filter) =>
  Claim.find(filter).sort({ createdAt: 1, _id: 1 }).populate(POPULATE).lean();

// Every matching claim in the API shape, no role filtering. Callers must run
// the result through viewClaims() before it leaves the server.
const loadSerialized = async (filter = {}) => (await load(filter)).map(serializeClaim);

module.exports = { POPULATE, load, loadSerialized };
