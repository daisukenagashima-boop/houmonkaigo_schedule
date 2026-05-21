// Firestore 全データ削除スクリプト
// 実行: node scripts/wipe-firestore.mjs
//
// 注意: クライアント側Firebase JS SDK経由なので、Firestoreルールが
// allow read,write: if true; になっている必要あり。

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
} from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(
  fs.readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8')
);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const COLLECTIONS_TO_WIPE = [
  'clients',
  'schedules',
  'records',
  'care_plans',
  'monitoring_reports',
  'conference_replies',
  'settings',
  'users',
];

async function wipeCollection(colName) {
  let totalDeleted = 0;
  for (let attempt = 1; attempt <= 15; attempt++) {
    const snap = await getDocs(collection(db, colName));
    if (snap.docs.length === 0) {
      if (attempt === 1) console.log(`  ✓ ${colName}: already empty`);
      else console.log(`  ✓ ${colName}: emptied (total deleted: ${totalDeleted})`);
      return;
    }
    console.log(`  → ${colName}: ${snap.docs.length} docs found (attempt ${attempt}), deleting...`);
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(doc(db, colName, d.id)));
      await batch.commit();
      totalDeleted += Math.min(400, snap.docs.length - i);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn(`  ⚠ ${colName}: still has docs after 15 attempts`);
}

console.log('🗑  Wiping Firestore data...');
for (const col of COLLECTIONS_TO_WIPE) {
  await wipeCollection(col);
}
console.log('🗑  All collections wiped.');
process.exit(0);
