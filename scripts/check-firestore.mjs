// Firestore の現状確認スクリプト
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(
  fs.readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8')
);
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const COLLECTIONS = [
  'clients', 'schedules', 'records', 'care_plans',
  'monitoring_reports', 'conference_replies', 'settings', 'users',
];

for (const col of COLLECTIONS) {
  const snap = await getDocs(collection(db, col));
  console.log(`${col}: ${snap.docs.length} docs`);
  // clients は最初の3件の住所を表示
  if (col === 'clients' && snap.docs.length > 0) {
    snap.docs.slice(0, 3).forEach((d) => {
      const data = d.data();
      console.log(`  - ${data.name}: ${data.address}`);
    });
  }
}
process.exit(0);
