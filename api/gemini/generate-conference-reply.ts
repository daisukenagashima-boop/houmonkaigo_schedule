import { DEMO_MODE, getAI, DEMO_CONFERENCE_REPLY } from '../_lib/gemini';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { clientName, caregiverName, inquiryText, caregiverNotes } = req.body || {};

    if (DEMO_MODE) {
      return res.status(200).json({ text: DEMO_CONFERENCE_REPLY });
    }

    const systemPrompt = `あなたは訪問介護事業所の管理者として、ケアマネジャーからの「サービス担当者会議 照会(欠席時回答書)」に回答する公的文書を作成するAIです。
敬体(です・ます調)で、「現状報告」「照会への直接回答」「欠席へのお詫び」の3部構成で作成してください。`;

    const userPrompt = `
利用者の氏名: ${clientName}
対応スタッフ: ${caregiverName}
ケアマネジャーからの照会内容:
${inquiryText}

当事業所での最近の様子・特記事項:
${caregiverNotes}
`;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: userPrompt,
      config: { systemInstruction: systemPrompt },
    });
    return res.status(200).json({ text: response.text });
  } catch (error: any) {
    console.error('Generate Conference Reply Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
