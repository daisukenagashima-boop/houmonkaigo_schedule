import { DEMO_MODE, getAI, DEMO_GENERIC } from './_helpers';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    if (DEMO_MODE) {
      return res.status(200).json({ text: DEMO_GENERIC });
    }

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });
    return res.status(200).json({ text: response.text });
  } catch (error: any) {
    console.error('Gemini Generate Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
