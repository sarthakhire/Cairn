const Handover = require("../models/Handover");
const Version = require("../models/Version");
const { loadSerialized } = require("./claimStore");
const { summarize, countChanges } = require("./versions");
const { findBlockers, warningCounts, sameClaims } = require("./approvalGate");

const STATE_ID = "handover";
const INCOMING_ROLES = ["incoming_lead", "incoming_developer"];
const isoSeconds = (d) => new Date(d).toISOString().slice(0, 19);

class HandoverError extends Error {
  constructor(status, message, blockers) {
    super(message);
    this.status = status;
    if (blockers) this.blockers = blockers;
  }
}

// The approved version, or null when nothing is shared. Fails closed: a missing
// snapshot counts as "not approved".
async function currentApproval() {
  const state = await Handover.findById(STATE_ID).lean();
  if (!state || state.approvedVersion == null) return null;
  const version = await Version.findOne({ number: state.approvedVersion }).lean();
  if (!version) return null;
  return {
    number: version.number,
    byName: version.byName,
    at: version.at,
    claims: version.claims,
    acknowledgements: state.acknowledgements || {},
  };
}

async function approve(user) {
  const claims = await loadSerialized({});

  // 1. Blockers: drafts, and accepted claims whose quote does not match the source.
  const blockers = findBlockers(claims);
  if (blockers.length) {
    const n = blockers.length;
    throw new HandoverError(409, n === 1 ? "1 claim blocks approval" : n + " claims block approval", blockers);
  }

  // 2. Nothing changed since the approved version: no new version, no new audit row.
  const current = await currentApproval();
  if (current && sameClaims(current.claims, claims)) {
    throw new HandoverError(409, "Version " + current.number + " is already approved and nothing changed");
  }

  const last = await Version.findOne().sort({ number: -1 }).select("number").lean();
  const number = last ? last.number + 1 : 1;
  const summary = { ...summarize(claims), warnings: warningCounts(claims) };
  try {
    await Version.create({ number, by: user.id, byName: user.name, at: new Date(), claims, summary });
  } catch (err) {
    if (err.code === 11000) throw new HandoverError(409, "Another approval was saved at the same time, try again");
    throw err;
  }
  // Acknowledgements belong to one version, so a new approval clears them.
  await Handover.updateOne(
    { _id: STATE_ID },
    { $set: { approvedVersion: number, acknowledgements: {} } },
    { upsert: true }
  );
  return { number, summary };
}

async function revoke() {
  const res = await Handover.updateOne(
    { _id: STATE_ID, approvedVersion: { $ne: null } },
    { $set: { approvedVersion: null, acknowledgements: {} } }
  );
  if (!res.matchedCount) throw new HandoverError(409, "Nothing is approved");
}

async function acknowledge(user) {
  if (!INCOMING_ROLES.includes(user.role)) throw new HandoverError(403, "Not allowed");
  const current = await currentApproval();
  if (!current) throw new HandoverError(409, "The handover has not been approved yet");
  if (current.acknowledgements[user.role]) return false; // keep the first time
  await Handover.updateOne(
    { _id: STATE_ID, approvedVersion: current.number },
    { $set: { ["acknowledgements." + user.role]: { at: new Date(), userId: user.id } } }
  );
  return true; // newly recorded
}

// What GET /api/approval returns. The reviewer gets the full picture; incoming
// roles get only whether something is shared and their own acknowledgement.
async function stateFor(user) {
  const current = await currentApproval();
  const approval = current
    ? { by: current.byName, at: isoSeconds(current.at), version: current.number }
    : null;

  const raw = current ? current.acknowledgements : {};
  const roles = user.role === "lead" ? INCOMING_ROLES : [user.role];
  const acknowledgements = {};
  for (const r of roles) if (raw[r]) acknowledgements[r] = { at: isoSeconds(raw[r].at) };

  const out = { approval, acknowledgements };
  if (user.role !== "lead") return out;

  const live = await loadSerialized({});
  const versions = await Version.find().sort({ number: 1 }).lean();
  out.pendingCount = live.filter((c) => c.review.state === "draft").length;
  out.changedCount = current ? countChanges(current.claims, live) : 0;
  out.nextVersion = (versions.length ? versions[versions.length - 1].number : 0) + 1;
  out.versions = versions.map((v) => ({
    number: v.number,
    by: v.byName,
    at: isoSeconds(v.at),
    summary: v.summary,
    claims: v.claims,
  }));
  return out;
}

module.exports = { HandoverError, INCOMING_ROLES, currentApproval, approve, revoke, acknowledge, stateFor };