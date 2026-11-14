// Dumps the demo state to data/demo-snapshot.json. Users are NOT included.
// Run from server/: npm run export:demo   (needs MONGO_URI in server/.env)
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const NAMES = ['Claim', 'Source', 'Chunk', 'Version', 'Handover', 'Counter'];

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
  const file = path.join(__dirname, '..', '..', 'data', 'demo-snapshot.json');
  fs.writeFileSync(file, text, 'utf8');
  console.log(`Wrote ${file} (${(text.length / 1024).toFixed(1)} KB)`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Export failed:', e.message);
  process.exit(1);
});