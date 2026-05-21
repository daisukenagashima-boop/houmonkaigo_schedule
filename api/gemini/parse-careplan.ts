import { DEMO_MODE, getAI, DEMO_CAREPLAN_PARSE } from './_helpers';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { text, fileData, mimeType } = req.body || {};

    if (DEMO_MODE) {
      return res.status(200).json({ text: DEMO_CAREPLAN_PARSE });
    }

    const systemPrompt = `あなたは介護プラン(ケアプラン)を解析して、訪問介護計画書向けの目標・サービス内容を抽出するAIアシスタントです。
入力された文章あるいはファイル(OCR/PDF)の情報を精査し、以下のJSONフォーマットで回答してください。
必ず、目標（最大3つ）とその評価の起点となる情報、現在提供されているサービスを特定してJSON形式で返却してください。

期待するJSONフォーマット:
{
  "clientName": "利用者氏名 (不明なら空文字)",
  "careLevel": "要介護度/要支援度",
  "period": "認定の有効期間",
  "currentService": "抽出された現在のサービス内容",
  "goals": ["目標1", "目標2", "目標3"]
}`;

    const contents: any[] = [];
    if (fileData && mimeType) {
      const cleanBase64 = fileData.replace(/^data:.*?;base64,/, '');
      contents.push({ inlineData: { mimeType, data: cleanBase64 } });
    }
    const userMessage = text
      ? `以下は提供されたケアプランの関連テキストです：\n${text}`
      : '添付されたファイル(ケアプラン)から要件を抽出してください。';
    contents.push(userMessage);

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });
    return res.status(200).json({ text: response.text });
  } catch (error: any) {
    console.error('Parse CarePlan Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
