// Step S4.4: put the demo data back exactly as it was saved. Used by the restore script and
// by the optional reset endpoint. Users and passwords are never touched.
//
// The snapshot is written by scripts/export-demo.js as Extended JSON, so ObjectIds and dates
// keep their types. Records point at users (reviewer, uploader, approver, actor). The users in
// the database today are not the ones that existed when the snapshot was taken, so every such
// reference is pointed at the user with the same role.
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { ROLES } = require("../constants");

const { EJSON, ObjectId } = mongoose.mongo.BSON;

const REQUIRED = ["Claim", "Source", "Chunk", "Version", "Handover", "Counter"];
const OPTIONAL = ["AuditLog"]; // older snapshots do not have it: then the audit trail is left alone
const USER_KEYS = new Set(["reviewerId", "byId", "by", "uploadedBy", "userId", "actorId"]);
const SNAPSHOT_FILE = path.join(__dirname, "..", "..", "seed-data", "demo-snapshot.json");

class SnapshotError extends Error {}

const isPlainObject = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

function parseSnapshot(text) {
  let data;
  try {
    data = EJSON.parse(text);
  } catch {
    throw new SnapshotError("The snapshot file is not valid JSON.");
  }
  if (!isPlainObject(data) || !isPlainObject(data.collections)) {
    throw new SnapshotError("The snapshot file has no \"collections\" section.");
  }
  for (const name of REQUIRED) {
    if (!Array.isArray(data.collections[name])) throw new SnapshotError("The snapshot has no " + name + " list.");
  }
  for (const name of OPTIONAL) {
    if (data.collections[name] !== undefined && !Array.isArray(data.collections[name])) {
      throw new SnapshotError("The snapshot's " + name + " is not a list.");
    }
  }
  // Restoring an empty product by mistake would wipe a working demo.
  if (data.collections.Claim.length === 0) throw new SnapshotError("The snapshot has no claims. Refusing to restore it.");
  if (data.collections.Source.length === 0) throw new SnapshotError("The snapshot has no sources. Refusing to restore it.");
  return data;
}

// Walks a value and swaps every ObjectId found under a user-pointing key. Anything else is
// copied as it is, and the input is never changed. `path` holds the keys above, so the role
// key in handover.acknowledgements.<role>.userId can be used as a hint.
function remapUsers(value, resolve, trail = []) {
  if (Array.isArray(value)) return value.map((v) => remapUsers(v, resolve, trail));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = remapUsers(v, resolve, [...trail, k]);
    return out;
  }
  if (value instanceof ObjectId && USER_KEYS.has(trail[trail.length - 1])) return resolve(value, trail);
  return value;
}

// users: [{ _id, role }] from the database now. userRoles: { oldId: role } from the snapshot.
function makeResolver(users, userRoles) {
  const byRole = {};
  for (const u of users) if (!byRole[u.role]) byRole[u.role] = u._id;
  if (!byRole.lead) throw new SnapshotError("There is no lead account. Run npm run seed first.");
  return (oldId, trail) => {
    const hinted = trail.find((k) => ROLES.includes(k)); // acknowledgements.incoming_lead.userId
    const role = hinted || (userRoles && userRoles[String(oldId)]) || "lead";
    return byRole[role] || byRole.lead;
  };
}

// Returns { Claim: [...], ... } ready to insert, only for the collections the snapshot has.
function prepare(snapshot, users) {
  const resolve = makeResolver(users, snapshot.userRoles);
  const out = {};
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    if (snapshot.collections[name] !== undefined) out[name] = remapUsers(snapshot.collections[name], resolve);
  }
  return out;
}

const looksLikeNoTransactions = (err) =>
  /replica set|Transaction numbers|transactions? (are|is) not supported/i.test(String((err && err.message) || err));

async function writeAll(models, prepared, session) {
  const opts = session ? { session } : {};
  for (const name of Object.keys(prepared)) {
    const collection = models[name].collection;
    await collection.deleteMany({}, opts);
    if (prepared[name].length) await collection.insertMany(prepared[name], { ...opts, ordered: true });
  }
}

// Inside a transaction when the database allows it, so a failure leaves the old data in place.
// A plain local MongoDB cannot do transactions: then it writes without one.
async function writeSnapshot({ models, prepared, db = mongoose }) {
  const session = await db.startSession();
  try {
    await session.withTransaction(() => writeAll(models, prepared, session));
    return { transactional: true };
  } catch (err) {
    if (!looksLikeNoTransactions(err)) throw err;
  } finally {
    await session.endSession();
  }
  await writeAll(models, prepared, undefined);
  return { transactional: false };
}

function loadSnapshotText(file = SNAPSHOT_FILE) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") throw new SnapshotError("No snapshot file at " + file);
    throw err;
  }
}

// The whole job: parse, point user references at today's users, write.
async function restoreDemo({ models, text, db = mongoose }) {
  const snapshot = parseSnapshot(text);
  const users = await models.User.find({}).select("role").lean();
  const prepared = prepare(snapshot, users);
  const { transactional } = await writeSnapshot({ models, prepared, db });
  const counts = Object.fromEntries(Object.entries(prepared).map(([k, v]) => [k, v.length]));
  return { counts, transactional, exportedAt: snapshot.exportedAt || null };
}

module.exports = {
  SnapshotError, SNAPSHOT_FILE, REQUIRED, OPTIONAL,
  parseSnapshot, remapUsers, makeResolver, prepare, writeSnapshot, loadSnapshotText, restoreDemo,
};