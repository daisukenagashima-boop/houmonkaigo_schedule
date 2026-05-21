import { DEMO_MODE, getAI, DEMO_MONITORING } from './_helpers';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { clientName, careLevel, period, currentService, goals, records } = req.body || {};

    if (DEMO_MODE) {
      return res.status(200).json({ text: DEMO_MONITORING });
    }

    const systemPrompt = `あなたは訪問介護のモニタリング報告書を自動生成する専門AIです。
提供された「訪問介護計画の目標」と「1ヶ月間の訪問記録」から、目標ごとの達成度(5段階)と評価根拠を判定してください。

期待するJSONフォーマット:
{
  "goalsStatus": [{ "goalText": "...", "evaluation": "達成|やや達成|維持|やや後退|後退", "basis": "..." }],
  "alongHomePlan": "している|していない",
  "alongCarePlan": "している|していない",
  "needRevision": "あり|なし",
  "satisfactionClient": "満足|ほぼ満足|やや不満|不満",
  "satisfactionFamily": "達成|やや達成|維持|やや後退|後退",
  "additionalNotes": "..."
}`;

    const userMessage = `
--- 利用者基本情報 ---
氏名: ${clientName}
要介護度: ${careLevel}
有効期間: ${period}
提供しているサービス: ${currentService}

--- 介護計画の目標 ---
${goals ? JSON.stringify(goals) : '未設定'}

--- 1ヶ月の訪問記録 ---
${records ? JSON.stringify(records) : '記録なし'}
`;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });
    return res.status(200).json({ text: response.text });
  } catch (error: any) {
    console.error('Generate Monitoring Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
