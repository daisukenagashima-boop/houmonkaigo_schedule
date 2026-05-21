import { DEMO_MODE, getAI, selectAssistantDemoResponse } from './_helpers.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { messages, schedules, clients, staff } = req.body || {};

    if (DEMO_MODE) {
      const lastUserMessage = Array.isArray(messages)
        ? [...messages].reverse().find((m: any) => m.role === 'user')
        : null;
      const userText = lastUserMessage?.parts?.[0]?.text || '';
      return res.status(200).json({ text: selectAssistantDemoResponse(userText) });
    }

    const systemPrompt = `あなたは訪問介護事業所の対話型AIアシスタント「ながらAI」です。
管理者の負担を減らし、訪問介護事業所の円滑な運営をサポートします。

【現在のデータ】
利用者: ${JSON.stringify(clients?.map((c: any) => ({ id: c.id, name: c.name, address: c.address })))}
スタッフ: ${JSON.stringify(staff?.map((s: any) => ({ id: s.id, name: s.name })))}
本日の訪問: ${JSON.stringify(schedules?.map((s: any) => ({ id: s.id, clientId: s.clientId, caregiverId: s.caregiverId, startTime: s.startTime, endTime: s.endTime, careType: s.careType, status: s.status })))}

statusが "cancelled" の案件があれば、その caregiverId に未割り当て(caregiverIdが空)の別の訪問予定をあてがう reassign アクションを提案してください。

提案は本文の最後に下記JSONブロックで添付できます:
\`\`\`json
{
  "actions": [
    { "type": "reassign", "scheduleId": "...", "caregiverId": "...", "caregiverName": "...", "reason": "..." }
  ]
}
\`\`\``;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: JSON.stringify(messages),
      config: { systemInstruction: systemPrompt },
    });
    return res.status(200).json({ text: response.text });
  } catch (error: any) {
    console.error('Assistant Chat Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
