// Vercel Serverless Functions 用の共通ロジック
// 同ディレクトリの api/gemini/ 配下に置くことで、_lib/ 配下の解決問題を回避。
// _helpers.ts の `_` prefix で、これ自体は Function化されない。

import { GoogleGenAI } from '@google/genai';

// =============== 環境設定 ===============
export const DEMO_MODE = process.env.DEMO_MODE === 'true';

let _ai: GoogleGenAI | null = null;
export function getAI() {
  if (_ai) return _ai;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  _ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
  return _ai;
}

// =============== デモ応答（DEMO_MODE=true 時） ===============

const DEMO_IDS = {
  SUZUKI: 'staff_suzuki_chie',
  UNASSIGNED_SCHEDULE: 'demo-unassigned-kobayashi',
} as const;

const CANCEL_RESCUE_TEXT = `本日10:00-11:00の **田中シズ江様**（要介護4・加納栄町通）の訪問が、ご本人様の急な体調不良のため急遽キャンセルとなりました。

担当の **鈴木 千恵さん**（非常勤）はこの時間枠が空いてしまい、給与保障の観点からも他のサービスをご案内したいところです。

ちょうど同じ時間帯（10:00-11:00）に、**小林フミ様**（要支援2・茜部本郷）の生活援助訪問が担当者未割当となっています。
小林様は普段から鈴木さんとも顔なじみで、お話し好きな方なので相性も問題ありません。

下記のアクションで1クリック適用できます。

\`\`\`json
{
  "actions": [
    {
      "type": "reassign",
      "scheduleId": "${DEMO_IDS.UNASSIGNED_SCHEDULE}",
      "caregiverId": "${DEMO_IDS.SUZUKI}",
      "caregiverName": "鈴木 千恵",
      "reason": "田中シズ江様のキャンセル枠（10:00-11:00）の代替として、同時間帯で未割当だった小林フミ様の訪問を鈴木千恵さんに再割り当て。鈴木さんの稼働確保と利用者様のサービス継続を両立します。"
    }
  ]
}
\`\`\``;

const MONITORING_INFO_TEXT = `モニタリング報告書のご質問ですね。

左メニューの「**AIモニタリング・計画**」を開くと、利用者ごとに過去1ヶ月分の訪問記録を読み込み、ケアプランの目標に対する達成度を AI が自動評価する画面に行けます。

操作の流れ：
1. 利用者を選択
2. ケアプランの目標を確認
3. 「AI に評価を生成させる」ボタンをクリック
4. 生成された5段階評価と評価根拠を確認・修正
5. 印刷 or 保存

特に新人サ責さん・経験の浅いサ責さんが、ベテランサ責さんと同等の文書を短時間で作れるのが当システムの売りです。
お試しになりますか？`;

const CONFERENCE_INFO_TEXT = `サービス担当者会議の照会回答書のご質問ですね。

左メニュー「**サービス担当者会議**」から、ケアマネジャー様からの照会内容を入力すると、当事業所の最近のサービス提供状況と特記事項をもとに AI が公的文書を自動起案します。

特徴：
- 敬体（です・ます調）で書かれる
- 「現状報告」「照会への回答」「欠席へのお詫び」の3部構成
- そのまま印刷・送付できる仕上がり
- 文章で気になる箇所はその場で編集可能

会議に出席できない時の事務負担を大きく減らせます。`;

const FALLBACK_TEXT = `お困りごとを承りました。

具体的に、何のスケジュール・利用者様・スタッフについてお聞きしたいかを教えていただけますでしょうか。

たとえば以下のようなご相談が可能です：
- 「明日のスケジュールでキャンセル救済が必要なところを教えて」
- 「田中シズ江様のモニタリング報告書を作って」
- 「○○ケアマネからの照会への回答書を起案して」`;

export function selectAssistantDemoResponse(userMessage: string): string {
  const msg = (userMessage || '').toLowerCase();
  const containsAny = (...words: string[]) => words.some((w) => msg.includes(w.toLowerCase()));
  if (
    containsAny('キャンセル', '救済', '代替', '給与', '稼働') ||
    (containsAny('明日', 'スケジュール') && containsAny('調整', '確認'))
  ) {
    return CANCEL_RESCUE_TEXT;
  }
  if (containsAny('モニタリング', '報告書', '評価', '月報')) {
    return MONITORING_INFO_TEXT;
  }
  if (containsAny('照会', '会議', '欠席', 'ケアマネ', '担当者会議')) {
    return CONFERENCE_INFO_TEXT;
  }
  return FALLBACK_TEXT;
}

export const DEMO_CAREPLAN_PARSE = JSON.stringify({
  clientName: '田中 シズ江',
  careLevel: '要介護4',
  period: '令和8年4月1日 〜 令和9年3月31日',
  currentService: '週3回 訪問介護（身体介護・生活援助混合、10:00-11:00）',
  goals: [
    '服薬支援と水分摂取の促しにより、脱水・尿路感染症を予防すること。',
    '見守りのもとで毎食ある程度の食事量を摂取し、栄養状態を維持すること。',
    'ヘルパー訪問時に会話を交わすことで、社会的孤立を防ぐこと。',
  ],
});

export const DEMO_MONITORING = JSON.stringify({
  goalsStatus: [
    {
      goalText: '服薬支援と水分摂取の促しにより、脱水・尿路感染症を予防すること。',
      evaluation: '達成',
      basis:
        '1ヶ月間の訪問記録より、毎回の訪問時にお薬の確認と水分摂取の促しを確実に実施できております。ご本人の飲水量も平均250-300mlを安定して保たれ、体温36.4度・脈拍72と安定。今期は尿路感染の所見もなく、目標は達成と評価いたします。',
    },
    {
      goalText: '見守りのもとで毎食ある程度の食事量を摂取し、栄養状態を維持すること。',
      evaluation: 'やや達成',
      basis:
        '主食・副食ともに7〜8割程度の摂取量を維持できております。ただし月中旬に食欲低下の所見あり、ご本人より「今日はあまり食べたくない」との発言。ご家族（長女様）にもお伝えし、好物の和菓子を補食として提案するなど工夫を継続中です。',
    },
    {
      goalText: 'ヘルパー訪問時に会話を交わすことで、社会的孤立を防ぐこと。',
      evaluation: '達成',
      basis:
        '訪問時には必ず10〜15分の会話時間を確保。最近は若かりし頃の歌（特に美空ひばり）の話題で盛り上がられ、笑顔も多く見られます。長女様からも「最近表情が明るくなった」とのお声をいただいております。',
    },
  ],
  alongHomePlan: 'している',
  alongCarePlan: 'している',
  needRevision: 'なし',
  satisfactionClient: '満足',
  satisfactionFamily: '達成',
  additionalNotes:
    '全体として状態は安定。引き続き現在のサービス内容を継続することが望ましいと考えます。次期ケアプランでは、ご本人の趣味（歌・園芸）を活かしたリハビリ要素の追加を提案する予定です。',
});

export const DEMO_CONFERENCE_REPLY = `# サービス担当者会議 照会への回答書

担当ケアマネジャー様

訪問介護ステーションながら
サービス提供責任者　長嶋 乃祐

## 現状報告

田中シズ江様におかれましては、当事業所より週3回（月・水・金）10時から1時間の訪問介護サービスを提供させていただいております。直近1ヶ月の訪問状況において、バイタルサインは概ね安定しており、食事摂取量も主食・副食ともに7〜8割を維持されています。

## ご照会への回答

### 1. ご本人の体調について
特段の急変や変調は認められず、お薬の管理も訪問時に確実に実施しております。一方、4月中旬頃に一時的に食欲低下の所見がございましたが、現在は回復傾向にあります。

### 2. 認知機能について
短期記憶の低下は継続しておりますが、ヘルパーとの会話は穏やかに成立しております。特に若かりし頃の話題（歌謡曲や園芸）になりますと、生き生きとした表情で語られます。

### 3. ご家族との連携について
ご長女様（名古屋在住）には月1回の電話報告を継続しており、5月の連絡では「最近表情が明るくなった」とのご評価をいただきました。

## 欠席のお詫び

このたびのサービス担当者会議には、当事業所内の研修日程と重なり出席が叶わず、誠に申し訳ございません。
会議内で出ました論点・決定事項につきましては、後日議事録を拝見のうえ、関係スタッフへ展開し、確実なサービス提供に反映してまいります。

引き続き、田中シズ江様の在宅生活の継続を支えるべく、関係各位と連携してまいりますので、何卒よろしくお願い申し上げます。
`;

export const DEMO_GENERIC =
  'デモモード中はAI応答が事前定義されたサンプルに切り替わっています。実APIに切り替えるには Vercel/.env の DEMO_MODE を false にしてください。';
