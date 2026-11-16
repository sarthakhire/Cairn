// Dumps the demo state to a snapshot file. Users and passwords are NOT included.
// Run from server/:  npm run export:demo                       (writes ../backup/demo-snapshot.json)
//                    npm run export:demo -- --out seed-data/demo-snapshot.json
// Needs MONGO_URI in server/.env. Restore with: npm run restore:demo
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const NAMES = ['Claim', 'Source', 'Chunk', 'Version', 'Handover', 'Counter', 'AuditLog'];

function loadModel(name) {
  const m = require(path.join(__dirname, '..', 'src', 'models', name));
  if (m && m.modelName) return m;
  const found = Object.values(m || {}).find((v) => v && v.modelName);
  if (!found) throw new Error(`Could not find a model export in models/${name}.js`);
  return found;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing. Put it in server/.env (that file is git-ignored).');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const out = { exportedAt: new Date().toISOString(), collections: {} };
  for (const name of NAMES) {
    const docs = await loadModel(name).find({}).lean();
    out.collections[name] = docs;
    console.log(`${name}: ${docs.length}`);
  }
  // Which old user id had which role, so a restore can point references at today's users.
  // Roles only: no names, emails or password hashes.
  const users = await loadModel('User').find({}).select('role').lean();
  out.userRoles = Object.fromEntries(users.map((u) => [String(u._id), u.role]));

  // EJSON keeps ObjectIds and dates typed, so a restore can rebuild them exactly.
  const EJSON = mongoose.mongo && mongoose.mongo.BSON && mongoose.mongo.BSON.EJSON;
  const text = EJSON
    ? EJSON.stringify(out, { relaxed: false }, 2)
    : JSON.stringify(out, null, 2);
  // Safety: refuse to write if a real secret value ended up in the data.
  for (const key of ['JWT_SECRET', 'LLM_API_KEY', 'SEED_PASSWORD']) {
    const v = process.env[key];
    if (v && v.length >= 8 && text.includes(v)) {
      console.error(`Refusing to write: the data contains the value of ${key}.`);
      process.exit(1);
    }
  }
  if (/\$2[aby]\$\d{2}\$/.test(text)) {
    console.error('Refusing to write: the data contains what looks like a password hash.');
    process.exit(1);
  }
  const i = process.argv.indexOf('--out');
  const file = i > -1 && process.argv[i + 1]
    ? path.resolve(process.argv[i + 1])
    : path.join(__dirname, '..', '..', 'backup', 'demo-snapshot.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  console.log(`Wrote ${file} (${(text.length / 1024).toFixed(1)} KB)`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Export failed:', e.message);
  process.exit(1);
});