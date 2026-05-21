import {
  collection,
  getDocs,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client, UserProfile, RecurringSchedule } from '../types';
import { format, subDays } from 'date-fns';

// ===============================================================
// 事業所「訪問介護ステーションながら」 デモシードデータ
// ===============================================================
// 想定: 岐阜市内に拠点をもつ訪問介護事業所、開所5年、利用者60名、月訪問150件、
//        常勤介護士3名（うち1名はサ責兼務） + 非常勤4名 の計7名体制。
//
// デモ動線（AIキャンセル救済シナリオ）の核となる固定レコード:
//   schedules/demo-cancel-tanaka       本日10:00 田中シズ江様 鈴木千恵 担当 → status:'cancelled'
//   schedules/demo-unassigned-kobayashi 本日10:00 小林フミ様 担当未割当
//   → AIに「キャンセル救済」を相談すると、鈴木さんを小林様の枠に再割り当てする提案が出る。
// ===============================================================

// ----- 固定ID（demoResponses.ts と一致させること） -----
export const DEMO_FIXED_IDS = {
  SUZUKI: 'staff_suzuki_chie',
  TANAKA: 'client_tanaka_shizue',
  KOBAYASHI: 'client_kobayashi_fumi',
  CANCEL_SCHEDULE: 'demo-cancel-tanaka',
  UNASSIGNED_SCHEDULE: 'demo-unassigned-kobayashi',
} as const;

// ----- スタッフ定義 -----
interface SeedStaff extends Omit<UserProfile, 'id'> {
  _docId: string;
  _isAdmin: boolean;
  _employmentType: '常勤' | '非常勤';
}

const STAFF_DATA: SeedStaff[] = [
  {
    _docId: 'PLACEHOLDER_ADMIN', // 実行時に loggedInUserId に置き換え
    _isAdmin: true,
    _employmentType: '常勤',
    name: '長嶋 乃祐',
    email: 'admin@nagara-care.example.jp',
    role: 'admin',
    phone: '058-260-1111',
    assignedAreas: ['岐阜市内全域'],
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    _docId: 'staff_kato_kenji',
    _isAdmin: false,
    _employmentType: '常勤',
    name: '加藤 健二',
    email: 'kato@nagara-care.example.jp',
    role: 'staff',
    phone: '090-1234-5678',
    assignedAreas: ['加納', '茜部'],
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    _docId: 'staff_tamura_manami',
    _isAdmin: false,
    _employmentType: '常勤',
    name: '田村 真奈美',
    email: 'tamura@nagara-care.example.jp',
    role: 'staff',
    phone: '090-2345-6789',
    assignedAreas: ['鏡島', '芥見'],
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    _docId: 'staff_sato_mitsuko',
    _isAdmin: false,
    _employmentType: '非常勤',
    name: '佐藤 美津子',
    email: 'sato@nagara-care.example.jp',
    role: 'staff',
    phone: '090-3456-7890',
    assignedAreas: ['長森'],
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    _docId: 'staff_yamada_yuka',
    _isAdmin: false,
    _employmentType: '非常勤',
    name: '山田 由香',
    email: 'yamada@nagara-care.example.jp',
    role: 'staff',
    phone: '090-4567-8901',
    assignedAreas: ['茜部', '加納'],
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    _docId: DEMO_FIXED_IDS.SUZUKI,
    _isAdmin: false,
    _employmentType: '非常勤',
    name: '鈴木 千恵',
    email: 'suzuki@nagara-care.example.jp',
    role: 'staff',
    phone: '090-5678-9012',
    assignedAreas: ['加納'],
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    _docId: 'staff_takahashi_kenta',
    _isAdmin: false,
    _employmentType: '非常勤',
    name: '高橋 健太',
    email: 'takahashi@nagara-care.example.jp',
    role: 'staff',
    phone: '090-6789-0123',
    assignedAreas: ['長森', '芥見'],
    status: 'active',
    createdAt: new Date().toISOString(),
  },
];

// ----- 主役利用者5名（フルプロフィール + ケアプラン用情報） -----
interface HeroClient extends Omit<Client, 'id'> {
  _docId: string;
  _careLevel: string;
  _goals: string[];
  _period: string;
}

const HERO_CLIENTS: HeroClient[] = [
  {
    _docId: DEMO_FIXED_IDS.TANAKA,
    _careLevel: '要介護4',
    _period: '令和8年4月1日 〜 令和9年3月31日',
    _goals: [
      '服薬支援と水分摂取の促しにより、脱水・尿路感染症を予防すること。',
      '見守りのもとで毎食ある程度の食事量を摂取し、栄養状態を維持すること。',
      'ヘルパー訪問時に会話を交わすことで、社会的孤立を防ぐこと。',
    ],
    name: '田中 シズ江',
    furigana: 'たなか しずえ',
    birthDate: '1943-07-12',
    age: 82,
    gender: 'female',
    address: '岐阜市加納栄町通4丁目12-3',
    phone: '058-271-1234',
    notes:
      '認知症初期。短期記憶低下あり。お薬の飲み忘れ・水分摂取の促しが必要。独居でご家族（長女）は名古屋在住、月1回訪問。',
    recurringSchedules: [
      { daysOfWeek: [1, 3, 5], startTime: '10:00', endTime: '11:00', careType: '身体・生活', frequency: 'weekly' },
    ],
    assessment: {
      adl: { eating: '自立', bathing: '一部介助', toileting: '自立', dressing: '自立', ambulation: '自立（ふらつきあり）' },
      iadl: { cooking: '全介助', shopping: '全介助', cleaning: '一部介助', medication: '一部介助', phone: '自立' },
      cognition: { hdsR: 18, mmse: 22, notes: '短期記憶の低下あり。会話は穏やかに成立。日付や時間の見当識に低下が見られる。' },
      health: {
        diseases: ['アルツハイマー型認知症（軽度）', '高血圧症', '変形性膝関節症'],
        medications: ['アムロジピン 5mg（朝1錠・降圧剤）', 'ドネペジル 5mg（朝1錠・認知症薬）', 'ロキソプロフェン頓服'],
        allergies: ['特記なし'],
        medicalNotes: '主治医: 加納中央クリニック 山田医師。月1回往診あり。',
      },
      social: {
        livingWith: '独居',
        familySupport: '長女様（名古屋市在住）が月1回訪問。週1回の電話連絡あり。',
        communityInvolvement: '近隣の老人会には参加されていない。歌が好きで、訪問時の会話で生気が出る。',
      },
      updatedAt: '2026-05-01T00:00:00.000Z',
      updatedBy: '長嶋 乃祐',
    },
    careMgrInfo: {
      careManagerName: '山田 由美子',
      careManagerOfficeName: '加納居宅介護支援センター',
      careManagerPhone: '058-271-5678',
      carePlanSummary:
        '独居で認知症が進行しつつあるご利用者様の在宅生活を、訪問介護・往診医・長女様の連携で支えるプランです。服薬・水分摂取支援、見守り、生活援助を中心に組み立て、転倒や脱水を未然に防ぐことを最優先とします。',
      carePlanGoals: [
        '長期目標: 認知症の進行を緩やかにし、できる限り住み慣れた自宅で安全に生活を継続する。',
        '短期目標(1): 訪問介護による服薬支援で、お薬の飲み忘れをなくす。',
        '短期目標(2): 水分摂取の促しにより、脱水・尿路感染症を予防する。',
        '短期目標(3): 週3回の見守りと会話により、社会的孤立を防ぐ。',
      ],
      carePlanFileUrl: '#',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    generalMemo:
      '【家族連絡先】\n長女様: 080-xxxx-xxxx（名古屋市・看護師）\n緊急時はまず長女様 → 不通なら加納中央クリニック\n\n【特記】\n・美空ひばりの歌が大好物。会話のきっかけに有効\n・夏場は冷房を嫌がる傾向あり、声かけ必須\n・郵便受けに新聞が溜まっていたら異変のサイン',
    attachments: [
      // 基本情報タブ
      {
        name: '介護保険被保険者証_スキャン.pdf',
        type: 'pdf',
        category: 'basic',
        uploadedAt: '2026-03-15T13:00:00.000Z',
        size: '420 KB',
        uploaderName: '長嶋 乃祐',
      },
      // アセスメントタブ
      {
        name: 'アセスメントシート_初回（2026-03-15記入）.pdf',
        type: 'pdf',
        category: 'assessment',
        uploadedAt: '2026-03-15T14:30:00.000Z',
        size: '843 KB',
        uploaderName: '長嶋 乃祐',
      },
      // 訪問介護計画タブ
      {
        name: '訪問介護計画書_令和8年度.pdf',
        type: 'pdf',
        category: 'care-plan',
        uploadedAt: '2026-04-05T11:00:00.000Z',
        size: '623 KB',
        uploaderName: '長嶋 乃祐',
      },
      // ケアマネプランタブ
      {
        name: 'ケアプラン原本_田中シズ江様_令和8年度.pdf',
        type: 'pdf',
        category: 'cm-plan',
        uploadedAt: '2026-04-01T10:00:00.000Z',
        size: '1.2 MB',
        uploaderName: '山田 由美子（ケアマネ）',
      },
      {
        name: '主治医意見書_加納中央クリニック.pdf',
        type: 'pdf',
        category: 'cm-plan',
        uploadedAt: '2026-03-20T09:00:00.000Z',
        size: '512 KB',
        uploaderName: '長嶋 乃祐',
      },
      // 訪問記録タブ
      {
        name: '4月15日訪問時_玄関先の様子.jpg',
        type: 'image',
        category: 'record',
        uploadedAt: '2026-04-15T10:30:00.000Z',
        size: '1.8 MB',
        uploaderName: '鈴木 千恵',
      },
      // その他タブ
      {
        name: '居室見取り図（玄関〜寝室）.jpg',
        type: 'image',
        category: 'other',
        uploadedAt: '2026-03-15T15:00:00.000Z',
        size: '2.1 MB',
        uploaderName: '加藤 健二',
      },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    _docId: 'client_sasaki_kazuo',
    _careLevel: '要介護2',
    _period: '令和8年4月1日 〜 令和9年3月31日',
    _goals: [
      '歩行訓練の継続支援により、室内移動が安定して行えること。',
      '入浴介助を通して清潔保持と身体機能の維持を図ること。',
      'ご本人とご家族の介護負担軽減と気持ちのケア。',
    ],
    name: '佐々木 和夫',
    furigana: 'ささき かずお',
    birthDate: '1949-11-23',
    age: 76,
    gender: 'male',
    address: '岐阜市鏡島東2丁目8-15',
    phone: '058-251-4567',
    notes: '右脳梗塞後、左半身に軽度の麻痺。リハビリ目的で訪問介護を利用。妻（73歳）と二人暮らし。',
    recurringSchedules: [
      { daysOfWeek: [2, 5], startTime: '13:00', endTime: '14:00', careType: '身体介護', frequency: 'weekly' },
    ],
    assessment: {
      adl: { eating: '自立', bathing: '一部介助', toileting: '自立', dressing: '一部介助', ambulation: '歩行器' },
      iadl: { cooking: '一部介助', shopping: '全介助', cleaning: '一部介助', medication: '自立', phone: '自立' },
      cognition: { hdsR: 26, mmse: 27, notes: '認知機能は概ね保たれる。リハビリ意欲も高い。' },
      health: {
        diseases: ['右脳梗塞（左半身軽度麻痺）', '高血圧症', '2型糖尿病'],
        medications: ['アスピリン 100mg（朝）', 'アムロジピン 5mg（朝）', 'メトホルミン 500mg（朝夕）'],
        allergies: ['特記なし'],
        medicalNotes: '主治医: 鏡島総合病院リハビリ科 鈴木医師。月2回外来通院。',
      },
      social: { livingWith: '妻（73歳）と二人暮らし', familySupport: '妻が献身的に介護。長男（東京在住）月1回電話連絡。', communityInvolvement: '元中学校教師、聞き上手。将棋が趣味。' },
      updatedAt: '2026-04-15T00:00:00.000Z',
      updatedBy: '田村 真奈美',
    },
    careMgrInfo: {
      careManagerName: '高橋 真澄',
      careManagerOfficeName: '鏡島ケアプランセンター',
      careManagerPhone: '058-251-9876',
      carePlanSummary: '脳梗塞後のリハビリ継続と、ご夫婦二人暮らしの生活維持を支援するプラン。歩行訓練・入浴介助を中心に、ご本人の意欲を活かしたサービス提供。',
      carePlanGoals: ['長期目標: 自宅内での自立移動を維持し、要介護度の改善を目指す。', '短期目標(1): 歩行器を使った室内移動の安定。', '短期目標(2): 入浴介助による清潔保持と転倒予防。'],
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    generalMemo: '【家族連絡先】\n奥様: 058-251-4567（同居）\n長男様: 080-yyyy-yyyy（東京）\n\n【特記】\n・元中学校教師、物腰柔らか\n・将棋が趣味、訪問時に1局指すことも',
    attachments: [
      { name: '介護保険被保険者証_佐々木様.pdf', type: 'pdf', category: 'basic', uploadedAt: '2026-02-10T10:00:00.000Z', size: '380 KB', uploaderName: '長嶋 乃祐' },
      { name: 'アセスメント_佐々木様（2026-02-10）.pdf', type: 'pdf', category: 'assessment', uploadedAt: '2026-02-10T14:00:00.000Z', size: '912 KB', uploaderName: '長嶋 乃祐' },
      { name: '訪問介護計画書_佐々木様.pdf', type: 'pdf', category: 'care-plan', uploadedAt: '2026-03-01T11:00:00.000Z', size: '598 KB', uploaderName: '長嶋 乃祐' },
      { name: 'ケアプラン原本_佐々木様.pdf', type: 'pdf', category: 'cm-plan', uploadedAt: '2026-02-25T10:00:00.000Z', size: '1.0 MB', uploaderName: '高橋 真澄' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    _docId: DEMO_FIXED_IDS.KOBAYASHI,
    _careLevel: '要支援2',
    _period: '令和8年4月1日 〜 令和9年3月31日',
    _goals: [
      '生活援助（掃除・洗濯・調理）により、清潔で安全な居住環境を維持すること。',
      '買い物代行により、週を通して十分な食材を確保すること。',
      '会話を通して心理的安定と社会的なつながりを保つこと。',
    ],
    name: '小林 フミ',
    furigana: 'こばやし ふみ',
    birthDate: '1936-03-08',
    age: 89,
    gender: 'female',
    address: '岐阜市茜部本郷3丁目5-22',
    phone: '058-271-3210',
    notes: '独居、ADL自立しているが膝の痛みで買い物・調理が困難。生活援助中心。話好きで毎回30分は話したがる。',
    recurringSchedules: [
      { daysOfWeek: [1, 4], startTime: '10:00', endTime: '11:00', careType: '生活援助', frequency: 'weekly' },
    ],
    assessment: {
      adl: { eating: '自立', bathing: '自立', toileting: '自立', dressing: '自立', ambulation: '自立（杖併用）' },
      iadl: { cooking: '一部介助', shopping: '一部介助', cleaning: '一部介助', medication: '自立', phone: '自立' },
      cognition: { hdsR: 28, mmse: 29, notes: '認知機能良好。会話・記憶ともに問題なし。' },
      health: {
        diseases: ['変形性膝関節症（両膝）', '高血圧症'],
        medications: ['アムロジピン 5mg（朝）', 'ロキソプロフェン 60mg（疼痛時）'],
        allergies: ['ペニシリン系（過敏症）'],
        medicalNotes: '主治医: 茜部いとう内科。月1回受診。',
      },
      social: { livingWith: '独居', familySupport: '息子様（東京在住）盆暮れに帰省。週1回電話連絡。', communityInvolvement: '近隣の老人クラブに月1回参加。話好きで地域交流活発。' },
      updatedAt: '2026-04-20T00:00:00.000Z',
      updatedBy: '佐藤 美津子',
    },
    careMgrInfo: {
      careManagerName: '鈴木 明美',
      careManagerOfficeName: '茜部ケアプランセンター',
      careManagerPhone: '058-271-2468',
      carePlanSummary: '独居かつADL自立の利用者様に対し、生活援助（買い物・調理・掃除）と社会的交流の機会を維持するプラン。膝の痛みによる転倒予防にも配慮。',
      carePlanGoals: ['長期目標: 独居生活の継続と社会的孤立の予防。', '短期目標(1): 生活援助による清潔・安全な居住環境の維持。', '短期目標(2): 週2回の訪問で会話の機会を確保。'],
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    generalMemo: '【家族連絡先】\n息子様: 080-zzzz-zzzz（東京）\n\n【特記】\n・話好き、毎回30分は世間話に付き合うこと\n・お茶を出してくださるので、丁重に頂戴する\n・編み物が趣味、毎月新作を見せてくださる',
    attachments: [
      { name: '介護保険被保険者証_小林様.pdf', type: 'pdf', category: 'basic', uploadedAt: '2026-01-15T10:00:00.000Z', size: '375 KB', uploaderName: '長嶋 乃祐' },
      { name: 'アセスメント_小林様.pdf', type: 'pdf', category: 'assessment', uploadedAt: '2026-01-15T14:00:00.000Z', size: '820 KB', uploaderName: '長嶋 乃祐' },
      { name: '訪問介護計画書_小林様.pdf', type: 'pdf', category: 'care-plan', uploadedAt: '2026-02-01T11:00:00.000Z', size: '580 KB', uploaderName: '長嶋 乃祐' },
      { name: 'ケアプラン原本_小林様.pdf', type: 'pdf', category: 'cm-plan', uploadedAt: '2026-01-25T10:00:00.000Z', size: '950 KB', uploaderName: '鈴木 明美' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    _docId: 'client_yamaguchi_haruko',
    _careLevel: '要介護3',
    _period: '令和8年4月1日 〜 令和9年3月31日',
    _goals: [
      '転倒予防のための移動見守りと環境整備。',
      '服薬時間の徹底支援により症状コントロール。',
      'ご家族との連携を密にし、急変時の対応体制を整えること。',
    ],
    name: '山口 春子',
    furigana: 'やまぐち はるこ',
    birthDate: '1947-09-19',
    age: 78,
    gender: 'female',
    address: '岐阜市芥見東山4丁目10-7',
    phone: '058-243-8765',
    notes: 'パーキンソン病（ヤール分類III度）。娘家族と同居。日中は娘が仕事のため独居状態。',
    recurringSchedules: [
      { daysOfWeek: [1, 3, 5], startTime: '14:00', endTime: '15:00', careType: '身体・生活', frequency: 'weekly' },
    ],
    assessment: {
      adl: { eating: '自立', bathing: '一部介助', toileting: '一部介助', dressing: '一部介助', ambulation: '車椅子（屋内は伝い歩き）' },
      iadl: { cooking: '全介助', shopping: '全介助', cleaning: '全介助', medication: '一部介助', phone: '自立' },
      cognition: { hdsR: 24, mmse: 25, notes: '軽度低下あり。動作緩慢のため意思疎通に時間を要する場面あり。' },
      health: {
        diseases: ['パーキンソン病（ヤール分類III度）', '便秘症', '骨粗鬆症'],
        medications: ['レボドパ・カルビドパ配合錠（毎食後）', '酸化マグネシウム 330mg（朝夕）', 'ビスホスホネート週1回'],
        allergies: ['特記なし'],
        medicalNotes: '主治医: 芥見神経内科クリニック 渡辺医師。2週間ごと外来通院。',
      },
      social: { livingWith: '娘家族（娘・娘婿・孫2人）と同居', familySupport: '娘様が主介護者。日中は娘様が勤務のため見守り体制が手薄。', communityInvolvement: '外出機会は通院のみ。趣味は読書と園芸。' },
      updatedAt: '2026-04-10T00:00:00.000Z',
      updatedBy: '田村 真奈美',
    },
    careMgrInfo: {
      careManagerName: '田中 綾子',
      careManagerOfficeName: '芥見居宅支援センター',
      careManagerPhone: '058-243-1357',
      carePlanSummary: 'パーキンソン病進行による転倒・誤嚥リスクへの対応と、日中独居時間帯の安全確保を重視するプラン。服薬管理の徹底と環境整備が要。',
      carePlanGoals: ['長期目標: 転倒・誤嚥のない在宅生活の継続。', '短期目標(1): 服薬時間の徹底と症状コントロール。', '短期目標(2): 日中独居時の安全確保と急変時の対応体制整備。'],
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    generalMemo: '【家族連絡先】\n娘様: 090-aaaa-aaaa（同居・勤務先 058-xxx-xxxx）\n娘婿様: 080-bbbb-bbbb\n\n【特記】\n・午後の薬切れ時間帯（オフ時間）は動作緩慢が顕著\n・転倒歴あり（2025年12月、自宅内）',
    attachments: [
      { name: '介護保険被保険者証_山口様.pdf', type: 'pdf', category: 'basic', uploadedAt: '2026-01-20T10:00:00.000Z', size: '385 KB', uploaderName: '長嶋 乃祐' },
      { name: 'アセスメント_山口様.pdf', type: 'pdf', category: 'assessment', uploadedAt: '2026-01-20T14:00:00.000Z', size: '895 KB', uploaderName: '長嶋 乃祐' },
      { name: '訪問介護計画書_山口様.pdf', type: 'pdf', category: 'care-plan', uploadedAt: '2026-02-15T11:00:00.000Z', size: '612 KB', uploaderName: '長嶋 乃祐' },
      { name: 'ケアプラン原本_山口様.pdf', type: 'pdf', category: 'cm-plan', uploadedAt: '2026-02-01T10:00:00.000Z', size: '1.1 MB', uploaderName: '田中 綾子' },
      { name: '主治医意見書_芥見神経内科.pdf', type: 'pdf', category: 'cm-plan', uploadedAt: '2026-01-25T09:00:00.000Z', size: '480 KB', uploaderName: '長嶋 乃祐' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    _docId: 'client_watanabe_ryoichi',
    _careLevel: '要介護5',
    _period: '令和8年4月1日 〜 令和9年3月31日',
    _goals: [
      '褥瘡予防のための定期的な体位変換と皮膚観察。',
      '経管栄養の確実な実施と異常の早期発見。',
      'ご家族の介護負担軽減と精神的支援。',
    ],
    name: '渡辺 良一',
    furigana: 'わたなべ りょういち',
    birthDate: '1940-04-15',
    age: 85,
    gender: 'male',
    address: '岐阜市長森本町2丁目18-9',
    phone: '058-260-9876',
    notes: '寝たきり。経管栄養（胃瘻）。妻と長男夫婦と同居。褥瘡予防のため定期的な体位変換が必要。',
    recurringSchedules: [
      { daysOfWeek: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '10:00', careType: '身体介護', frequency: 'weekly' },
    ],
    assessment: {
      adl: { eating: '全介助（経管栄養）', bathing: '全介助', toileting: '全介助（オムツ）', dressing: '全介助', ambulation: '寝たきり' },
      iadl: { cooking: '全介助', shopping: '全介助', cleaning: '全介助', medication: '全介助', phone: '全介助' },
      cognition: { hdsR: 12, mmse: 14, notes: '重度認知症レベル。発話困難。呼びかけには軽くうなずく程度の反応。' },
      health: {
        diseases: ['脳梗塞後遺症（寝たきり状態）', '誤嚥性肺炎既往', '胃瘻造設後', '高血圧症'],
        medications: ['ワーファリン 1mg（朝・経管投与）', '降圧剤（経管投与）', '便秘予防薬'],
        allergies: ['特記なし'],
        medicalNotes: '主治医: 長森中央クリニック 訪問診療チーム。月2回の往診。看護師による医療処置（胃瘻管理）あり。',
      },
      social: { livingWith: '妻（80歳）・長男夫婦と同居', familySupport: '長男夫婦が主介護者。妻も補助。介護負担大きい状況。', communityInvolvement: '外出困難。地域とのつながりは家族経由。' },
      updatedAt: '2026-04-05T00:00:00.000Z',
      updatedBy: '加藤 健二',
    },
    careMgrInfo: {
      careManagerName: '鈴木 健一',
      careManagerOfficeName: '長森居宅支援センター',
      careManagerPhone: '058-260-2580',
      carePlanSummary: '重度要介護者（要介護5）に対し、訪問介護・訪問看護・訪問診療の連携で在宅医療生活を支えるプラン。褥瘡予防、経管栄養管理、ご家族の介護負担軽減を最優先とする。',
      carePlanGoals: ['長期目標: 在宅医療生活の継続と褥瘡・誤嚥性肺炎の予防。', '短期目標(1): 定期的な体位変換による褥瘡予防。', '短期目標(2): 経管栄養の確実な実施と異常の早期発見。', '短期目標(3): ご家族（特に長男夫婦・妻）への介護指導と心理的支援。'],
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    generalMemo: '【家族連絡先】\n長男様: 080-cccc-cccc（同居）\n長男奥様: 080-dddd-dddd（同居・看護師資格あり）\n奥様: 058-260-9876（同居）\n\n【特記】\n・胃瘻部からの漏れに注意\n・体位変換は2時間ごと\n・吸引必要、訪問時は喀痰吸引も実施',
    attachments: [
      { name: '介護保険被保険者証_渡辺様.pdf', type: 'pdf', category: 'basic', uploadedAt: '2026-01-05T10:00:00.000Z', size: '395 KB', uploaderName: '長嶋 乃祐' },
      { name: 'アセスメント_渡辺様（医療依存度高）.pdf', type: 'pdf', category: 'assessment', uploadedAt: '2026-01-05T14:00:00.000Z', size: '1.1 MB', uploaderName: '長嶋 乃祐' },
      { name: '訪問介護計画書_渡辺様.pdf', type: 'pdf', category: 'care-plan', uploadedAt: '2026-01-20T11:00:00.000Z', size: '720 KB', uploaderName: '長嶋 乃祐' },
      { name: 'ケアプラン原本_渡辺様.pdf', type: 'pdf', category: 'cm-plan', uploadedAt: '2026-01-15T10:00:00.000Z', size: '1.3 MB', uploaderName: '鈴木 健一' },
      { name: '主治医意見書_長森中央クリニック.pdf', type: 'pdf', category: 'cm-plan', uploadedAt: '2026-01-10T09:00:00.000Z', size: '520 KB', uploaderName: '長嶋 乃祐' },
      { name: '胃瘻管理手順書.pdf', type: 'pdf', category: 'other', uploadedAt: '2026-01-20T16:00:00.000Z', size: '650 KB', uploaderName: '加藤 健二' },
    ],
    createdAt: new Date().toISOString(),
  },
];

// ----- 準主役・モブ用の名前生成データ -----
const SUB_LAST_NAMES = [
  '伊藤', '渡辺', '高橋', '中村', '小川', '前田', '岡田', '近藤', '坂本', '藤田',
  '森', '池田', '橋本', '阿部', '石川', '山内', '松本', '井上', '木村', '林',
  '斎藤', '清水', '山崎', '吉田', '川村', '関', '酒井', '河野', '中島', '大野',
];
const SUB_MALE_NAMES = ['一郎', '昭三', '正治', '博', '清', '進', '実', '精一', '明', '義雄', '哲夫', '隆', '勉', '忠雄', '茂'];
const SUB_FEMALE_NAMES = ['よし子', '清子', '和子', 'よう子', '幸子', '節子', '悦子', '京子', '恵美子', 'ちよ', 'フミ子', '久美子', '富子', '静江', '貞子'];

// 岐阜市内のリアルな町名（実在の番地は使わない）
const GIFU_AREAS = [
  '加納栄町通', '加納清水町', '加納徳川町', '茜部本郷', '茜部新所',
  '鏡島東', '鏡島西', '鏡島中', '芥見東山', '芥見岩戸', '芥見大退',
  '長森本町', '長森岩戸', '岩野田', '長住町', '神田町', '本町',
  '橋本町', '市橋', '日野東', '日野西', '北一色', '東金宝町',
  '切通', '福光東', '福光西', '岩崎', '則武', '領下', '城東通',
];

const CARE_NOTES_VARIATIONS = [
  '歩行器を利用して室内はほぼ自立移動可能。ふらつきに注意が必要。',
  '認知機能の減退あり。水分補給の訪問時促しが重要。',
  '食事時の見守りと入浴時見守り（生活援助主体）。',
  '腰痛があり、起き上がりと立ち上がりに介助が必要。',
  'お薬の飲み忘れが多いため、訪問時に確認・服薬支援。',
  '排泄の見守り、定期的なパッドチェックおよび交換が推奨。',
  '日常の買い物代行と簡単な調理・配膳。食欲は旺盛。',
  '独居。家族は遠方のため、安否確認も兼ねた訪問。',
  '配偶者と二人暮らし。配偶者も高齢のため家事支援。',
  '夜間せん妄あり、日中の生活リズム整備が必要。',
];

// 利用者60名分のうち、主役5名以降の55名を機械生成
function generateNonHeroClients(): Omit<Client, 'id'>[] {
  const clients: Omit<Client, 'id'>[] = [];
  const timeSlots = [
    { start: '08:30', end: '09:30' },
    { start: '09:00', end: '10:00' },
    { start: '10:00', end: '11:00' },
    { start: '11:00', end: '12:00' },
    { start: '13:00', end: '14:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' },
    { start: '16:00', end: '17:00' },
    { start: '17:00', end: '18:00' },
  ];
  const daysOptions: number[][] = [[1, 4], [2, 5], [3], [1, 3, 5], [2, 4]];
  const careTypesList: RecurringSchedule['careType'][] = ['身体介護', '生活援助', '身体・生活'];

  for (let i = 0; i < 55; i++) {
    const lastIdx = i % SUB_LAST_NAMES.length;
    const isMale = i % 3 === 0;
    const firstIdx = i % (isMale ? SUB_MALE_NAMES.length : SUB_FEMALE_NAMES.length);
    const firstName = isMale ? SUB_MALE_NAMES[firstIdx] : SUB_FEMALE_NAMES[firstIdx];
    const name = `${SUB_LAST_NAMES[lastIdx]} ${firstName}`;

    const birthYear = 1930 + (i % 30);
    const birthMonth = 1 + (i % 12);
    const birthDay = 1 + (i % 28);
    const age = 2026 - birthYear;

    const area = GIFU_AREAS[i % GIFU_AREAS.length];
    const blockNumber = `${1 + (i % 5)}丁目${1 + (i % 20)}-${1 + (i % 18)}`;
    const days = daysOptions[i % daysOptions.length];
    const slot = timeSlots[i % timeSlots.length];
    const careType = careTypesList[i % careTypesList.length];

    clients.push({
      name,
      furigana: name,
      birthDate: `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`,
      age,
      gender: isMale ? 'male' : 'female',
      address: `岐阜市${area}${blockNumber}`,
      notes: CARE_NOTES_VARIATIONS[i % CARE_NOTES_VARIATIONS.length],
      recurringSchedules: [
        { daysOfWeek: days, startTime: slot.start, endTime: slot.end, careType, frequency: 'weekly' },
      ],
      createdAt: new Date().toISOString(),
    });
  }
  return clients;
}

// ----- 全データ削除専用関数（投入はしない） -----
export async function wipeAllDemoData(loggedInUserId?: string) {
  if (!loggedInUserId) {
    throw new Error('ログインユーザーのID（UID）が取得できません。');
  }
  console.log('🗑  Wiping all Firestore demo data...');
  const cleanCollections = [
    'clients', 'schedules', 'records', 'care_plans',
    'monitoring_reports', 'conference_replies', 'settings',
  ];
  const wipe = async (col: string, keepDocId?: string) => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const snap = await getDocs(collection(db, col));
      const docsToDelete = snap.docs.filter((d) => d.id !== keepDocId);
      if (docsToDelete.length === 0) {
        console.log(`  ✓ ${col}: empty${attempt > 1 ? ` (after ${attempt} attempts)` : ''}`);
        return;
      }
      console.log(`  → ${col}: deleting ${docsToDelete.length} docs (attempt ${attempt})`);
      for (let i = 0; i < docsToDelete.length; i += 400) {
        const batch = writeBatch(db);
        docsToDelete.slice(i, i + 400).forEach((d) => batch.delete(doc(db, col, d.id)));
        await batch.commit();
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    console.warn(`  ⚠ ${col}: still has docs after 10 attempts.`);
  };
  for (const col of cleanCollections) {
    try { await wipe(col); } catch (e) { console.warn(`wipe failed ${col}`, e); }
  }
  try { await wipe('users', loggedInUserId); } catch (e) { console.warn(`wipe failed users`, e); }
  console.log('🗑  Wipe complete.');
}

// ----- メインのシード関数 -----
export async function seedCompleteDemoDatabase(
  loggedInUserId?: string,
  loggedInUserEmail?: string | null,
) {
  if (!loggedInUserId) {
    throw new Error('ログインユーザーのID（UID）が取得できません。ログイン状態を確認してください。');
  }
  console.log('🌱 Seeding 訪問介護ステーションながら (Gifu, 60 clients, 7 staff)...');

  // ===== 1. 既存データを全削除（最大3回リトライで残骸ゼロを保証） =====
  const cleanCollections = [
    'clients', 'schedules', 'records', 'care_plans',
    'monitoring_reports', 'conference_replies', 'settings',
  ];

  const wipeCollection = async (col: string, keepDocId?: string) => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const snap = await getDocs(collection(db, col));
      const docsToDelete = snap.docs.filter((d) => d.id !== keepDocId);
      if (docsToDelete.length === 0) {
        if (attempt === 1) console.log(`  ✓ ${col}: already empty`);
        else console.log(`  ✓ ${col}: emptied after ${attempt} attempts`);
        return;
      }
      console.log(`  → ${col}: deleting ${docsToDelete.length} docs (attempt ${attempt})`);
      for (let i = 0; i < docsToDelete.length; i += 400) {
        const batch = writeBatch(db);
        docsToDelete.slice(i, i + 400).forEach((d) => batch.delete(doc(db, col, d.id)));
        await batch.commit();
      }
      // Firestoreのキャッシュ反映を待つ（リトライ毎に待機を長く）
      await new Promise((r) => setTimeout(r, 800));
    }
    console.warn(`  ⚠ ${col}: still has docs after 10 attempts. Firebaseコンソールから手動削除を推奨。`);
  };

  for (const col of cleanCollections) {
    try {
      await wipeCollection(col);
    } catch (e) {
      console.warn(`  ⚠ wipe failed for ${col}:`, e);
    }
  }

  // users コレクションは、ログイン中の管理者を残して他を削除
  try {
    await wipeCollection('users', loggedInUserId);
  } catch (e) {
    console.warn('  ⚠ wipe failed for users:', e);
  }

  // 削除完了後、Firestoreの強整合性を待つ追加猶予
  await new Promise((r) => setTimeout(r, 800));

  // ===== 2. 事業所設定 =====
  await setDoc(doc(db, 'settings', 'office'), {
    officeName: '訪問介護ステーションながら',
    address: '岐阜市加納栄町通4丁目10-1',
    phone: '058-260-1111',
    fax: '058-260-1112',
    managerName: '長嶋 乃祐',
    foundedYear: 2021,
    aiAssistantName: 'ながらAI',
    updatedAt: new Date().toISOString(),
  });
  console.log('  ✓ settings/office');

  // ===== 3. スタッフ7名 =====
  const adminStaff = STAFF_DATA[0];
  await setDoc(doc(db, 'users', loggedInUserId), {
    name: adminStaff.name,
    email: loggedInUserEmail || adminStaff.email,
    role: 'admin',
    phone: adminStaff.phone,
    assignedAreas: adminStaff.assignedAreas,
    status: 'active',
    employmentType: adminStaff._employmentType,
    createdAt: new Date().toISOString(),
  });

  for (let i = 1; i < STAFF_DATA.length; i++) {
    const s = STAFF_DATA[i];
    await setDoc(doc(db, 'users', s._docId), {
      name: s.name,
      email: s.email,
      role: s.role,
      phone: s.phone,
      assignedAreas: s.assignedAreas,
      status: s.status,
      employmentType: s._employmentType,
      createdAt: s.createdAt,
    });
  }
  console.log(`  ✓ seeded ${STAFF_DATA.length} staff`);

  // ===== 4. 利用者60名 =====
  const allClientIds: string[] = [];
  const allClientNames: string[] = [];

  for (const hero of HERO_CLIENTS) {
    const { _docId, _careLevel, _goals, _period, ...clientData } = hero;
    await setDoc(doc(db, 'clients', _docId), clientData);
    allClientIds.push(_docId);
    allClientNames.push(clientData.name);
  }

  const nonHero = generateNonHeroClients();
  const clientBatch = writeBatch(db);
  for (const c of nonHero) {
    const ref = doc(collection(db, 'clients'));
    clientBatch.set(ref, c);
    allClientIds.push(ref.id);
    allClientNames.push(c.name);
  }
  await clientBatch.commit();
  console.log(`  ✓ seeded ${allClientIds.length} clients`);

  // ===== 5. ケアプラン（主役5名分） =====
  const carePlanBatch = writeBatch(db);
  for (const hero of HERO_CLIENTS) {
    const ref = doc(collection(db, 'care_plans'));
    carePlanBatch.set(ref, {
      clientId: hero._docId,
      clientName: hero.name,
      caregiverId: loggedInUserId,
      careLevel: hero._careLevel,
      period: hero._period,
      currentService: hero.recurringSchedules
        ?.map((rs) => `${rs.careType}（週${rs.daysOfWeek.length}回 ${rs.startTime}〜${rs.endTime}）`)
        .join('、') || '訪問介護',
      goals: hero._goals,
      createdAt: new Date().toISOString(),
    });
  }
  await carePlanBatch.commit();
  console.log(`  ✓ seeded ${HERO_CLIENTS.length} care plans`);

  // ===== 6. 過去30日分の主役利用者の訪問記録 =====
  const recordsBatch = writeBatch(db);
  const staffIds = [loggedInUserId, ...STAFF_DATA.slice(1).map((s) => s._docId)];
  const staffNames = ['長嶋 乃祐', ...STAFF_DATA.slice(1).map((s) => s.name)];
  let recordCount = 0;

  for (const hero of HERO_CLIENTS) {
    const recurringDays = hero.recurringSchedules?.[0]?.daysOfWeek || [1, 4];
    const startTime = hero.recurringSchedules?.[0]?.startTime || '10:00';
    const endTime = hero.recurringSchedules?.[0]?.endTime || '11:00';
    const careType = hero.recurringSchedules?.[0]?.careType || '身体・生活';

    for (let d = 30; d >= 1; d--) {
      const date = subDays(new Date(), d);
      if (!recurringDays.includes(date.getDay())) continue;

      const caregiverIdx = (recordCount + recurringDays[0]) % staffIds.length;
      const ref = doc(collection(db, 'records'));
      recordsBatch.set(ref, {
        clientId: hero._docId,
        caregiverId: staffIds[caregiverIdx],
        caregiverName: staffNames[caregiverIdx],
        date: format(date, 'yyyy-MM-dd'),
        startTime,
        endTime,
        serviceType: '訪問介護',
        careType,
        vitalSigns: {
          temperature: 36.3 + (d % 8) * 0.1,
          bloodPressureHigh: 120 + (d % 5) * 5,
          bloodPressureLow: 75 + (d % 4) * 3,
          pulse: 68 + (d % 6) * 2,
          spo2: 97 + (d % 3),
          faceColor: 'good',
          sweating: 'none',
        },
        mealInfo: {
          mainDish: 7 + (d % 3),
          sideDish: 7 + (d % 3),
          fluid: 200 + (d % 4) * 50,
          mealCare: true,
          fluidCare: true,
        },
        excretionInfo: {
          urinationCount: 1 + (d % 2),
          urinationAmount: 'ふつう',
          defecationCount: d % 3 === 0 ? 1 : 0,
          notes: '排泄状況は安定。',
        },
        physicalCare: {
          hygiene: { wipingPartial: true, oralCare: true },
          movement: { transfer: true, positioning: true },
        },
        lifeSupport: {
          cleaning: { room: d % 2 === 0 },
          laundry: { wash: d % 3 === 0 },
          cooking: { menu: '主食、味噌汁、おかず2品' },
        },
        otherServices: {
          medication: { support: true },
          medical: {},
          selfReliance: {},
        },
        moneyManagement: {},
        exitCheck: { fire: true, electricity: true, water: true, locking: true },
        generalNotes: `${hero.name}様、本日もお変わりなくお過ごしです。${d % 5 === 0 ? '会話も弾み、笑顔が見られました。' : '体調安定。'}`,
        createdAt: subDays(new Date(), d).toISOString(),
      });
      recordCount++;
    }
  }
  await recordsBatch.commit();
  console.log(`  ✓ seeded ${recordCount} care records (past 30 days)`);

  // ===== 7. スケジュール =====
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // (a) キャンセル救済デモ用 固定スケジュール 2件
  await setDoc(doc(db, 'schedules', DEMO_FIXED_IDS.CANCEL_SCHEDULE), {
    clientId: DEMO_FIXED_IDS.TANAKA,
    caregiverId: DEMO_FIXED_IDS.SUZUKI,
    date: todayStr,
    startTime: '10:00',
    endTime: '11:00',
    careType: '身体・生活',
    status: 'cancelled',
  });
  await setDoc(doc(db, 'schedules', DEMO_FIXED_IDS.UNASSIGNED_SCHEDULE), {
    clientId: DEMO_FIXED_IDS.KOBAYASHI,
    caregiverId: '',
    date: todayStr,
    startTime: '10:00',
    endTime: '11:00',
    careType: '生活援助',
    status: 'scheduled',
  });
  console.log('  ✓ seeded 2 demo schedules (cancel rescue scenario)');

  // (b) その他のスケジュール
  const schedBatch = writeBatch(db);
  let schedCount = 2;

  // 今日の他5件
  const todayExtras = [
    { clientIdx: 1, time: '13:00-14:00', careType: '身体介護', caregiverIdx: 1, status: 'scheduled' },
    { clientIdx: 3, time: '14:00-15:00', careType: '身体・生活', caregiverIdx: 2, status: 'scheduled' },
    { clientIdx: 4, time: '09:00-10:00', careType: '身体介護', caregiverIdx: 1, status: 'completed' },
    { clientIdx: 5, time: '15:00-16:00', careType: '生活援助', caregiverIdx: 3, status: 'scheduled' },
    { clientIdx: 6, time: '16:00-17:00', careType: '身体介護', caregiverIdx: -1, status: 'scheduled' },
  ];
  for (const ex of todayExtras) {
    const [stTime, edTime] = ex.time.split('-');
    const ref = doc(collection(db, 'schedules'));
    schedBatch.set(ref, {
      clientId: allClientIds[ex.clientIdx],
      caregiverId: ex.caregiverIdx >= 0 ? staffIds[ex.caregiverIdx] : '',
      date: todayStr,
      startTime: stTime,
      endTime: edTime,
      careType: ex.careType,
      status: ex.status,
    });
    schedCount++;
  }

  // 過去2週間と未来3日のスケジュール
  for (let d = -3; d <= 14; d++) {
    const date = subDays(new Date(), d);
    const dateStr = format(date, 'yyyy-MM-dd');
    if (dateStr === todayStr) continue;

    const dailyCount = 5 + (Math.abs(d) % 5);
    for (let k = 0; k < dailyCount; k++) {
      const clientIdx = (k * 7 + Math.abs(d)) % allClientIds.length;
      const slotIdx = k % 8;
      const slot = ['08:30-09:30', '09:00-10:00', '10:00-11:00', '11:00-12:00', '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00'][slotIdx];
      const [stTime, edTime] = slot.split('-');
      const careType = (['身体介護', '生活援助', '身体・生活'] as const)[k % 3];

      const unassignedThisOne = d > 0 && k === 0;
      const caregiverIdx = unassignedThisOne ? -1 : (k + Math.abs(d)) % staffIds.length;
      const status = d > 0 ? 'scheduled' : 'completed';

      const ref = doc(collection(db, 'schedules'));
      schedBatch.set(ref, {
        clientId: allClientIds[clientIdx],
        caregiverId: caregiverIdx >= 0 ? staffIds[caregiverIdx] : '',
        date: dateStr,
        startTime: stTime,
        endTime: edTime,
        careType,
        status,
      });
      schedCount++;
    }
  }
  await schedBatch.commit();
  console.log(`  ✓ seeded ${schedCount} schedules`);

  // ===== 8. モニタリング報告書（主役5名 × 各2件） =====
  const monBatch = writeBatch(db);
  let monCount = 0;
  for (const hero of HERO_CLIENTS) {
    // 直近 + 前々月の2件
    for (let m = 0; m < 2; m++) {
      const dateOffset = m === 0 ? 7 : 67; // 1週間前 / 約2ヶ月前
      const monDate = subDays(new Date(), dateOffset);
      const ref = doc(collection(db, 'monitoring_reports'));
      monBatch.set(ref, {
        clientId: hero._docId,
        clientName: hero.name,
        monitoringDate: format(monDate, 'yyyy-MM-dd'),
        manager: '長嶋 乃祐',
        careLevel: hero._careLevel,
        period: hero._period,
        currentService: hero.recurringSchedules
          ?.map((rs) => `${rs.careType}（週${rs.daysOfWeek.length}回 ${rs.startTime}〜${rs.endTime}）`)
          .join('、') || '訪問介護',
        goalsStatus: hero._goals.map((g, i) => ({
          goalText: g,
          evaluation: (['達成', 'やや達成', '維持'] as const)[i % 3],
          basis: `${hero.name}様の${format(monDate, 'M月')}における訪問記録より、目標達成度を評価いたしました。バイタル・食事・行動観察ともに概ね安定しており、サービス効果が認められます。`,
        })),
        alongHomePlan: 'している',
        alongCarePlan: 'している',
        needRevision: 'なし',
        satisfactionClient: '満足',
        satisfactionFamily: '達成',
        additionalNotes: `引き続き現サービス内容を継続することが望ましいと考えます。${m === 0 ? '次月のケアプラン更新時に微調整を提案予定。' : ''}`,
        explainedDate: format(subDays(monDate, -3), 'yyyy-MM-dd'),
        explainedAuthor: '長嶋 乃祐',
        officeName: '訪問介護ステーションながら',
        createdAt: monDate.toISOString(),
      });
      monCount++;
    }
  }
  await monBatch.commit();
  console.log(`  ✓ seeded ${monCount} monitoring reports`);

  // ===== 9. サービス担当者会議 照会回答書（主役3名分） =====
  const confBatch = writeBatch(db);
  let confCount = 0;
  const conferenceSamples = [
    {
      hero: HERO_CLIENTS[0], // 田中シズ江
      daysAgo: 20,
      subject: '令和8年5月度 サービス担当者会議 照会回答書',
      inquiryText: '田中シズ江様の認知機能変化と服薬支援の状況についてご報告ください。また5月の入退院の有無についても合わせてお願いします。',
    },
    {
      hero: HERO_CLIENTS[1], // 佐々木和夫
      daysAgo: 35,
      subject: '令和8年4月度 リハビリ進捗 照会回答書',
      inquiryText: '佐々木和夫様の歩行機能・ADL改善状況について、訪問介護の立場からのご意見をお願いします。',
    },
    {
      hero: HERO_CLIENTS[4], // 渡辺良一
      daysAgo: 50,
      subject: '令和8年4月度 医療連携 担当者会議 照会回答書',
      inquiryText: '渡辺良一様の褥瘡管理状況および経管栄養の実施状況について、訪問看護との連携状況をお知らせください。',
    },
  ];
  for (const s of conferenceSamples) {
    const ref = doc(collection(db, 'conference_replies'));
    confBatch.set(ref, {
      clientId: s.hero._docId,
      clientName: s.hero.name,
      subject: s.subject,
      inquiryText: s.inquiryText,
      replyText: `${s.hero.name}様におかれましては、当事業所より${s.hero.recurringSchedules?.[0]?.careType}を中心としたサービスを提供させていただいております。\n\n直近の訪問状況においてはバイタル・行動観察ともに概ね安定しており、ご家族様からも継続的なご評価をいただいております。\n\n会議当日は出席が叶わず誠に申し訳ございません。議事録を確認のうえ、関係スタッフへ展開いたします。`,
      creatorName: '長嶋 乃祐',
      createdAt: subDays(new Date(), s.daysAgo).toISOString(),
    });
    confCount++;
  }
  await confBatch.commit();
  console.log(`  ✓ seeded ${confCount} conference replies`);

  console.log('🌱 Seeding complete: 訪問介護ステーションながら is ready for demo!');
}

// 別エクスポート（古いコードからの互換用）
export async function seedSampleRecords(caregiverId: string) {
  await seedCompleteDemoDatabase(caregiverId);
}
