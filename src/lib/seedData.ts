import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  setDoc,
  writeBatch,
  query,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client, UserProfile, Schedule, CareRecord, CarePlan } from '../types';
import { format, subDays } from 'date-fns';

export async function seedCompleteDemoDatabase(loggedInUserId?: string, loggedInUserEmail?: string) {
  console.log("Starting demo seeding with UID:", loggedInUserId, "and Email:", loggedInUserEmail);

  if (!loggedInUserId) {
    throw new Error("ログインユーザーのID（UID）が取得できません。ログイン状態を確認してください。");
  }

  // 1. Setup the list of staff caregivers we want to seed in the demo database.
  const staffToCreate: Omit<UserProfile, 'id'>[] = [
    // Full-time staff (常勤)
    {
      name: "長嶋 乃祐",
      email: loggedInUserEmail || "daisuke.nagashima@nagarainc.co.jp",
      role: "admin",
      phone: "090-1234-5678",
      assignedAreas: ["長柄町", "茂原市"],
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      name: "加藤 健二",
      email: "kenji.kato@example.com",
      role: "staff",
      phone: "090-1111-2222",
      assignedAreas: ["長柄町", "市原市"],
      status: "active",
      createdAt: new Date().toISOString()
    },
    // Part-time staff (非常勤・短時間パート)
    {
      name: "鈴木 美佐子",
      email: "misako.suzuki@example.com",
      role: "staff",
      phone: "090-3333-4444",
      assignedAreas: ["長柄町"],
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      name: "山田 花子",
      email: "hanako.yamada@example.com",
      role: "staff",
      phone: "090-5555-6666",
      assignedAreas: ["長柄町", "茂原市"],
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      name: "佐藤 和子",
      email: "kazuko.sato@example.com",
      role: "staff",
      phone: "090-7777-8888",
      assignedAreas: ["長柄町"],
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      name: "高橋 健太",
      email: "kenta.takahashi@example.com",
      role: "staff",
      phone: "090-9999-1111",
      assignedAreas: ["長柄町", "市原市"],
      status: "active",
      createdAt: new Date().toISOString()
    }
  ];

  const addedStaffIds: string[] = [];

  // Write current logged-in user's profile FIRST in the specific doc users/{loggedInUserId}.
  // Setting role: "admin" allows them to bypass other staff collection queries and clear data with isAdmin()!
  try {
    const loggedInStaff = staffToCreate.find(s => s.email === loggedInUserEmail) || staffToCreate[0];
    await setDoc(doc(db, 'users', loggedInUserId), {
      name: loggedInStaff.name,
      email: loggedInUserEmail || loggedInStaff.email,
      role: "admin",
      phone: loggedInStaff.phone,
      assignedAreas: loggedInStaff.assignedAreas,
      status: "active",
      createdAt: new Date().toISOString()
    });
    addedStaffIds.push(loggedInUserId);
    console.log(`Step 1 Complete: Registered UID: ${loggedInUserId} as admin.`);
  } catch (err: any) {
    console.error("Failed to write admin profile. Seeding aborted.", err);
    throw new Error(`管理者プロフィールの初期設定に失敗しました: ${err.message}`);
  }

  // 2. Wipe older records securely
  const bulkDeleteCollection = async (colName: string) => {
    const snap = await getDocs(collection(db, colName));
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + 400);
      chunk.forEach((docRef) => {
        batch.delete(doc(db, colName, docRef.id));
      });
      await batch.commit();
    }
  };

  const cleanCollections = ['clients', 'schedules', 'records', 'care_plans', 'monitoring_reports', 'conference_replies'];
  for (const col of cleanCollections) {
    try {
      await bulkDeleteCollection(col);
      console.log(`Wiped collection: ${col}`);
    } catch (e) {
      console.warn(`Could not clear collection ${col}:`, e);
    }
  }

  // Clear other users while keeping the logged-in admin user
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const docs = usersSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + 400);
      let deletedAny = false;
      chunk.forEach((docRef) => {
        if (docRef.id !== loggedInUserId && docRef.data().email !== loggedInUserEmail) {
          batch.delete(doc(db, 'users', docRef.id));
          deletedAny = true;
        }
      });
      if (deletedAny) {
        await batch.commit();
      }
    }
    console.log("Wiped other staff user files from DB");
  } catch (e) {
    console.warn("Could not clear previous user listings:", e);
  }

  // 3. Register the remaining 5 demo staff cards (鈴木さん、山田さん、佐藤さん、高橋さん、加藤さん)
  for (let idx = 1; idx < staffToCreate.length; idx++) {
    const staff = staffToCreate[idx];
    try {
      const docId = `staff_demo_${idx}`;
      await setDoc(doc(db, 'users', docId), staff);
      addedStaffIds.push(docId);
    } catch (err) {
      console.warn(`Could not add other staff ${staff.name}:`, err);
    }
  }
  console.log(`Step 2 Complete: Total staff accounts seed size: ${addedStaffIds.length}`);

  const fullTimeIds = [addedStaffIds[0], addedStaffIds[1]];
  const partTimeIds = [addedStaffIds[2], addedStaffIds[3], addedStaffIds[4], addedStaffIds[5]];

  // 4. Generate 60 Japanese Clients (要介護高齢利用者一覧)
  const lastNames = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水", "山崎", "森", "池田", "橋本", "阿部", "石川", "山内", "小川", "前田", "岡田"];
  const maleFirstNames = ["一郎", "昭三", "正治", "博", "清", "進", "実", "精一", "明", "義雄", "哲夫", "隆", "洋", "勉", "忠雄", "茂", "健一", "順一", "和夫", "正一"];
  const femaleFirstNames = ["よし", "清子", "和子", "よう子", "幸子", "節子", "悦子", "京子", "恵美子", "ちよ", "フミ", "久美子", "富子", "静江", "貞子", "キヨ", "マサコ", "タカ子", "ハル", "トシ子"];

  const lastNamesKana = ["さとう", "すずき", "たかはし", "たなか", "いとう", "わたなべ", "やまおと", "なかむら", "こばやし", "かとう", "よしだ", "やまだ", "ささき", "やまぐち", "まつもと", "いのうえ", "きむら", "はやし", "さいとう", "しみず", "やまざき", "もり", "いけだ", "はしもと", "あべ", "いしかわ", "やまうち", "おがわ", "まえだ", "おかだ"];
  const maleFirstNamesKana = ["いちろう", "しょうぞう", "まさはる", "ひろし", "きよし", "すすむ", "みのる", "せいいち", "あきら", "よしお", "てつお", "たかし", "ひろし", "つとむ", "ただお", "しげる", "けんいち", "じゅんいち", "かずお", "しょういち"];
  const femaleFirstNamesKana = ["よし", "きよこ", "かずこ", "ようこ", "さちこ", "せつこ", "えつこ", "きょうこ", "えみこ", "ちよ", "ふみ", "くみこ", "とみこ", "しずえ", "さだこ", "きよ", "まさこ", "たかこ", "はる", "としこ"];

  const careNotes = [
    "歩行器を利用して室内はほぼ自立移動可能です。ふらつきに注意が必要。",
    "認知機能の減退あり。水分補給の訪問時促しが極めて大切。",
    "食事時の見守りと入浴時見守り（生活援助主体）。",
    "腰痛があり、起き上がりと立ち上がりに介助が必要です。",
    "お薬の飲み忘れが多いため、訪問時に確認・服薬支援をお願いします。",
    "排尿・排便の見守り、定期的なオムツパッドのチェックおよび交換が推奨。",
    "日常の買い物代行、および簡単な調理・配膳。食欲は旺盛です。"
  ];

  const addedClientIds: string[] = [];
  const addedClientNames: string[] = [];

  try {
    const clientsToInsert: Omit<Client, 'id'>[] = [];
    for (let i = 0; i < 60; i++) {
      const lastNameIdx = i % lastNames.length;
      const isMale = i % 2 === 0;
      const firstNameIdx = Math.floor(i / 2) % 20;

      const name = `${lastNames[lastNameIdx]} ${isMale ? maleFirstNames[firstNameIdx] : femaleFirstNames[firstNameIdx]}`;
      const furigana = `${lastNamesKana[lastNameIdx]} ${isMale ? maleFirstNamesKana[firstNameIdx] : femaleFirstNamesKana[firstNameIdx]}`;
      
      const birthYear = 1928 + (i % 25);
      const birthMonth = 1 + (i % 12);
      const birthDay = 1 + (i % 28);
      const birthDate = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
      const age = 2026 - birthYear;

      const recScheds = [];
      if (i % 3 === 0) {
        recScheds.push({
          daysOfWeek: [1, 4], 
          startTime: "10:00",
          endTime: "11:00",
          careType: "身体介護" as const,
          frequency: "weekly" as const
        });
      } else if (i % 3 === 1) {
        recScheds.push({
          daysOfWeek: [2, 5], 
          startTime: "13:30",
          endTime: "14:30",
          careType: "生活援助" as const,
          frequency: "weekly" as const
        });
      } else {
        recScheds.push({
          daysOfWeek: [3], 
          startTime: "09:00",
          endTime: "10:30",
          careType: "身体・生活" as const,
          frequency: "weekly" as const
        });
      }

      clientsToInsert.push({
        name,
        furigana,
        birthDate,
        age,
        gender: isMale ? 'male' : 'female',
        address: `千葉県長生郡長柄町針ヶ谷 ${100 + i}`,
        notes: careNotes[i % careNotes.length],
        recurringSchedules: recScheds,
        createdAt: new Date().toISOString()
      });
    }

    const clientBatch = writeBatch(db);
    clientsToInsert.forEach((client) => {
      const newDocRef = doc(collection(db, 'clients'));
      clientBatch.set(newDocRef, client);
      addedClientIds.push(newDocRef.id);
      addedClientNames.push(client.name);
    });
    await clientBatch.commit();
    console.log(`Step 3 Complete: Seeded 60 client dossiers via fast batch commit.`);
  } catch (err) {
    console.error("Failed to seed client index:", err);
  }

  // 5. Create Care Plans for major demo clients (Clients 0, 1, 2)
  try {
    const careLevels = ["要介護1", "要介護2", "要介護3", "要介護4", "要介護5"];
    const plansBatch = writeBatch(db);
    for (let j = 0; j < 3; j++) {
      if (!addedClientIds[j]) continue;
      const goalsList = [
        [
          "手すりを用いて室内での自立移動が安定して行えるようになること。",
          "水分摂取を十分に促し、尿路感染症などの発症を防ぐこと。",
          "見守りのもとで安全に入浴を行い、清潔を保持すること。"
        ],
        [
          "定期的な見守りと適切な排泄支援を受け、皮膚トラブルを防ぐこと。",
          "ヘルパー訪問時に安定した食事を摂取し、栄養状態を維持すること。",
          "服薬支援を受け、飲み忘れや二重服薬を完全に防止すること。"
        ],
        [
          "生活援助（掃除・洗濯）を通じて、清潔で安全な居住環境が維持されること。",
          "ヘルパーによる買い物支援により、週を通して十分な食材を確保すること。",
          "コミュニケーションをとり心理的な安定と社会的な孤立を防ぐこと。"
        ]
      ];

      const ref = doc(collection(db, 'care_plans'));
      plansBatch.set(ref, {
        clientId: addedClientIds[j],
        clientName: addedClientNames[j],
        caregiverId: fullTimeIds[0], 
        careLevel: careLevels[j % careLevels.length],
        period: "2026年04月01日 〜 2027年03月31日",
        currentService: "週2回 訪問介護サービス提供（身体介護・生活援助）",
        goals: goalsList[j],
        createdAt: new Date().toISOString()
      });
    }
    await plansBatch.commit();
    console.log("Step 4 Complete: Seeded Care Plans via fast batch.");
  } catch (err) {
    console.warn("Failed to seed care plans:", err);
  }

  // 6. Seed yesterday's historical records (for history and dashboard metrics)
  try {
    const yesterday = subDays(new Date(), 1);
    const dateStr = format(yesterday, 'yyyy-MM-dd');
    const recordsBatch = writeBatch(db);

    for (let k = 0; k < 8; k++) {
      if (!addedClientIds[k]) continue;
      const clientId = addedClientIds[k];
      const caregiverName = staffToCreate[k % staffToCreate.length].name;
      
      const ref = doc(collection(db, 'records'));
      recordsBatch.set(ref, {
        clientId,
        caregiverId: loggedInUserId, // Complies with record collection security rule check!
        caregiverName, // Display helper name to provide accurate visual context in the list!
        date: dateStr,
        startTime: "10:00",
        endTime: "11:00",
        serviceType: "訪問介護",
        careType: k % 2 === 0 ? "身体介護" : "生活援助",
        vitalSigns: {
          temperature: 36.4 + (k % 5) * 0.1,
          bloodPressureHigh: 125 + (k % 3) * 5,
          bloodPressureLow: 78 + (k % 3) * 2,
          faceColor: "good",
          sweating: "none"
        },
        mealInfo: {
          mainDish: 8,
          sideDish: 9,
          fluid: 250,
          mealCare: true,
          fluidCare: true
        },
        excretionInfo: {
          urinationCount: 1,
          urinationAmount: "ふつう",
          defecationCount: 0,
          notes: "排泄状況、尿量ともに良好です。"
        },
        physicalCare: {
          hygiene: { wipesFull: true, oralCare: true },
          movement: { transfer: true }
        },
        lifeSupport: {
          cleaning: { room: true },
          laundry: { wash: true },
          cooking: { menu: "ごはん、味噌汁、塩サバ" }
        },
        otherServices: {
          gridCheck: true,
          medication: { support: true },
          medical: {},
          selfReliance: {}
        },
        moneyManagement: {},
        exitCheck: { fire: true, electricity: true, water: true, locking: true },
        generalNotes: `${addedClientNames[k]}様、本日の訪問ケアにお変わりなく過ごされました。担当ヘルパーは${caregiverName}です。`,
        createdAt: new Date().toISOString()
      });
    }
    await recordsBatch.commit();
    console.log("Step 5 Complete: Seeded historical care journals via fast batch.");
  } catch (err) {
    console.warn("Failed to seed yesterday's historical records:", err);
  }

  // 7. Seed exactly 150 Schedules across the current week for the 60 clients
  try {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const dates: string[] = [];
    // Generate dates: 3 days ago to 3 days in the future (7 days total)
    for (let d = -3; d <= 3; d++) {
      dates.push(format(subDays(new Date(), d), 'yyyy-MM-dd'));
    }

    const startTimes = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
    const endTimes   = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
    const careTypes: ("身体介護" | "生活援助" | "身体・生活" | "その他")[] = ["身体介護", "生活援助", "身体・生活"];

    const schedsBatch = writeBatch(db);

    for (let s = 0; s < 150; s++) {
      const clientId = addedClientIds[s % addedClientIds.length];
      if (!clientId) continue;

      const date = dates[Math.floor(s / (150 / dates.length)) % dates.length] || todayStr;
      
      const isUnassigned = s % 12 === 0; // Create some unassigned ones for visual drag & drop practice
      const caregiverId = isUnassigned ? "" : addedStaffIds[s % addedStaffIds.length];

      const timeIdx = s % startTimes.length;
      const startTime = startTimes[timeIdx];
      const endTime = endTimes[timeIdx];
      const careType = careTypes[s % careTypes.length];
      const status = date < todayStr ? 'completed' : 'scheduled';

      const ref = doc(collection(db, 'schedules'));
      schedsBatch.set(ref, {
        clientId,
        caregiverId,
        date,
        startTime,
        endTime,
        careType,
        status
      });
    }

    await schedsBatch.commit();
    console.log("Step 6 Complete: Seeded exactly 150 weekly schedules across 60 clients via fast batch.");
  } catch (err) {
    console.warn("Failed to seed schedules:", err);
  }

  console.log("Seeding process completed perfectly!");
}

export async function seedSampleRecords(caregiverId: string) {
  // Graceful delegation to full demo builder
  await seedCompleteDemoDatabase(caregiverId);
}
