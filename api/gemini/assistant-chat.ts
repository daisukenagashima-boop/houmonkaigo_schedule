import { DEMO_MODE, getAI, selectAssistantDemoResponse } from './_helpers.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { messages, schedules, clients, staff } = req.body || {};

  const extractUserText = () => {
    const lastUserMessage = Array.isArray(messages)
      ? [...messages].reverse().find((m: any) => m.role === 'user')
      : null;
    return lastUserMessage?.parts?.[0]?.text || '';
  };

  // DEMO_MODE: 事前応答に直行
  if (DEMO_MODE) {
    return res.status(200).json({ text: selectAssistantDemoResponse(extractUserText()) });
  }

  // 実API呼び出し
  try {
    const systemPrompt = `あなたは訪問介護事業所「訪問介護ステーションながら」の対話型AIアシスタント「ながらAI」です。
管理者の業務負担を減らし、訪問介護事業所の円滑な運営をサポートする役割です。

【現在のデータ】
利用者一覧: ${JSON.stringify(clients?.slice(0, 30)?.map((c: any) => ({ id: c.id, name: c.name, address: c.address })))}
スタッフ一覧: ${JSON.stringify(staff?.map((s: any) => ({ id: s.id, name: s.name })))}
本日の訪問予定: ${JSON.stringify(schedules?.map((s: any) => ({ id: s.id, clientId: s.clientId, caregiverId: s.caregiverId, startTime: s.startTime, endTime: s.endTime, careType: s.careType, status: s.status })))}

【ふるまい】
- 介護現場のサ責さん視点で、温かく具体的に答えてください
- statusが "cancelled" の案件があれば、その caregiverId に未割り当ての別の訪問予定をあてがう reassign アクションを積極的に提案
- 提案を1クリック適用できるよう、本文末尾に下記JSONブロックを添付してください

\`\`\`json
{
  "actions": [
    { "type": "reassign", "scheduleId": "対象schedule_id", "caregiverId": "あてがうstaff_id", "caregiverName": "スタッフ名", "reason": "提案理由" }
  ]
}
\`\`\`

会話履歴は配列形式で渡されます。ユーザーの直近の質問に答えてください。`;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: JSON.stringify(messages),
      config: { systemInstruction: systemPrompt },
    });
    return res.status(200).json({ text: response.text });
  } catch (error: any) {
    // フォールバック: 事前応答（レート制限・キー無効・ネットワーク不調などをカバー）
    console.warn('Gemini API failed, falling back to demo response:', error.message);
    return res.status(200).json({
      text: selectAssistantDemoResponse(extractUserText()),
      _fallback: true,
    });
  }
}
