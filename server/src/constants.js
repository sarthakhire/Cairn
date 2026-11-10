// One place for every enum, so models, routes and tests cannot drift apart.
// Role and visibility names follow client/src/mock/claims.json (the contract).

const ROLES = ["incoming_developer", "incoming_lead", "lead"]; // lead = the reviewer
const SENSITIVITY = ["team", "lead_only", "restricted"]; // also used for claim visibility
const SOURCE_KINDS = ["notes", "github", "tasks"];
const FORMALITY = ["formal", "informal"];

const CLAIM_TYPES = [
  "decision",
  "open_question",
  "ownership",
  "risk_dependency",
  "next_action",
];
const CLAIM_STATUSES = ["verified", "uncertain", "conflicting", "missing"];
const REVIEW_STATES = ["draft", "accepted", "edited", "rejected"];

const RESTRICTED_PLACEHOLDER = "Restricted: request access from reviewer";

module.exports = {
  ROLES,
  SENSITIVITY,
  SOURCE_KINDS,
  FORMALITY,
  CLAIM_TYPES,
  CLAIM_STATUSES,
  REVIEW_STATES,
  RESTRICTED_PLACEHOLDER,
};