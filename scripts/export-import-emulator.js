'use strict';

/**
 * Habitual Firestore Cloud Data Export & Local Emulator Seeding Helper
 * Usage:
 * 1. Export production data to JSON:
 *    GOOGLE_APPLICATION_CREDENTIALS="./serviceAccount.json" node scripts/export-import-emulator.js export
 * 2. Import JSON data into Local Firestore Emulator:
 *    node scripts/export-import-emulator.js import
 */

const fs = require('fs');
const path = require('path');
let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  admin = require('../functions/node_modules/firebase-admin');
}

const DUMP_FILE = path.join(__dirname, '..', 'emulator-data-dump.json');
const COLLECTIONS = ['share', 'share_invites', 'habit_chats', 'templates'];

async function exportCloudData() {
  console.log('📡 Connecting to Production Cloud Firestore...');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();
  const dump = {};

  for (const colName of COLLECTIONS) {
    console.log(`  Downloading collection: ${colName}...`);
    const snap = await db.collection(colName).get();
    dump[colName] = snap.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));
    console.log(`  ✔ Downloaded ${dump[colName].length} documents from ${colName}`);
  }

  fs.writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 2));
  console.log(`\n🎉 Cloud data successfully saved to ${DUMP_FILE}`);
}

async function importToLocalEmulator() {
  console.log('🔥 Connecting to Local Firestore Emulator (127.0.0.1:8080)...');
  process.env.FIREBASE_FIRESTORE_EMULATOR_HOST = process.env.FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`❌ Data dump file not found at ${DUMP_FILE}. Please run export first or provide a data file.`);
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'habitual-log' });
  }
  const db = admin.firestore();
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, 'utf8'));

  for (const [colName, docs] of Object.entries(dump)) {
    console.log(`  Importing collection: ${colName} (${docs.length} docs)...`);
    for (const item of docs) {
      await db.collection(colName).doc(item.id).set(item.data, { merge: true });
    }
    console.log(`  ✔ Imported ${colName}`);
  }

  console.log('\n🎉 Local Firestore Emulator successfully seeded with cloud data!');
}

const command = process.argv[2] || 'help';

if (command === 'export') {
  exportCloudData().catch(err => {
    console.error('❌ Export failed:', err);
    process.exit(1);
  });
} else if (command === 'import') {
  importToLocalEmulator().catch(err => {
    console.error('❌ Import failed:', err);
    process.exit(1);
  });
} else {
  console.log(`
Habitual Firestore Emulator Seeding Utility

Commands:
  node scripts/export-import-emulator.js export
    - Connects to production Cloud Firestore and dumps collections to emulator-data-dump.json

  node scripts/export-import-emulator.js import
    - Reads emulator-data-dump.json and populates the Local Firestore Emulator
`);
}
