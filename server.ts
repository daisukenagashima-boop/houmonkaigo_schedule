import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import {
  selectAssistantDemoResponse,
  DEMO_CAREPLAN_PARSE,
  DEMO_MONITORING,
  DEMO_CONFERENCE_REPLY,
  DEMO_GENERIC,
} from "./src/lib/demoResponses";

dotenv.config();

// DEMO_MODE: true なら Gemini API を呼ばず、事前応答を返す（商談デモ用）
const DEMO_MODE = process.env.DEMO_MODE === "true";

async function startServer() {
  const app = express();
  const PORT = 3000;
  if (DEMO_MODE) {
    console.log("🎭 DEMO_MODE=true: Gemini API calls are mocked with pre-defined responses.");
  }

  // JSON Body Parser for API requests
  app.use(express.json());

  // Initialize Gemini API client on the server
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Secure server-side Gemini API generation proxy
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      if (DEMO_MODE) {
        return res.json({ text: DEMO_GENERIC });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Parse external care plan (PDF or Image or raw text) and output structured Care Plan items
  app.post("/api/gemini/parse-careplan", async (req, res) => {
    try {
      const { text, fileData, mimeType } = req.body;

      if (DEMO_MODE) {
        return res.json({ text: DEMO_CAREPLAN_PARSE });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const systemPrompt = `あなたは介護プラン(ケアプラン)を解析して、訪問介護計画書向けの目標・サービス内容を抽出するAIアシスタントです。
入力された文章あるいはファイル(OCR/PDF)の情報を精査し、以下のJSONフォーマットで回答してください。
必ず、目標（最大3つ）とその評価の起点となる情報、現在提供されているサービスを特定してJSON形式で返却してください。

期待するJSONフォーマット:
{
  "clientName": "利用者氏名 (不明なら空文字)",
  "careLevel": "要介護度/要支援度 (要介護1〜5、要支援1〜2など、不明なら空文字)",
  "period": "認定の有効期間 (例: 令和5年4月1日〜令和7年3月31日、不明なら空文字)",
  "currentService": "抽出された現在のサービス内容・生活援助や身体介護の具体的な行為",
  "goals": [
    "目標1 (生活機能の維持や食事動作、歩行などに関する目標)",
    "目標2 (あれば、家事援助や衣服整理などに関する目標)",
    "目標3 (あれば、その他自立支援に関する目標)"
  ]
}`;

      const contents: any[] = [];
      if (fileData && mimeType) {
        const cleanBase64 = fileData.replace(/^data:.*?;base64,/, "");
        contents.push({
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64
          }
        });
      }

      const userMessage = text ? `以下は提供されたケアプランの関連テキストです：\n${text}` : "添付されたファイル(ケアプラン)から要件を抽出してください。";
      contents.push(userMessage);

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Parse CarePlan Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Generate Monitoring Report using 1 month of Care Records/Logs
  app.post("/api/gemini/generate-monitoring", async (req, res) => {
    try {
      const { clientName, careLevel, period, currentService, goals, records } = req.body;

      if (DEMO_MODE) {
        return res.json({ text: DEMO_MONITORING });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const systemPrompt = `あなたは訪問介護のモニタリング報告書を自動生成する専門AIです。
提供された利用者の「訪問介護計画の目標」と「1ヶ月間の日々の訪問記録(活動ログやバイタル、食事等の特記事項)」から、
目標ごとの達成度(5段階評価：達成・やや達成・維持・やや後退・後退)とその「評価の根拠」を自動判定し、モニタリングシートを作成してください。

日々の日誌をもとに、客観的で具体的かつ温かみのある評価根拠テキスト(日本語)を自動執筆してください。

期待するJSONフォーマット:
{
  "goalsStatus": [
    {
      "goalText": "目標1の文章",
      "evaluation": "達成" | "やや達成" | "維持" | "やや後退" | "後退",
      "basis": "1ヶ月の記録（〇/〇の検温や食事状況、移動介助の様子など）に見る具体的な達成状況と変化に基づく詳細な評価根拠"
    },
    ...
  ],
  "alongHomePlan": "している" | "していない",
  "alongCarePlan": "している" | "していない",
  "needRevision": "あり" | "なし",
  "satisfactionClient": "満足" | "ほぼ満足" | "やや不満" | "不満",
  "satisfactionFamily": "達成" | "やや達成" | "維持" | "やや後退" | "後退",
  "additionalNotes": "その他特記事項や変化点、サービス提供責任者としての気づきや今後のプラン修正提案など"
}`;

      const userMessage = `
--- 利用者基本情報 ---
氏名: ${clientName}
要介護度: ${careLevel}
有効期間: ${period}
提供しているサービス: ${currentService}

--- 設定されている介護計画の目標 ---
${goals ? JSON.stringify(goals) : "未設定"}

--- 1ヶ月間の介護訪問記録(日付、バイタル、特記事項) ---
${records ? JSON.stringify(records) : "日々の訪問記録はありません。目標に対して標準的な傾向の維持として作成してください。"}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: userMessage,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Generate Monitoring Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Generate official reply for query/conference inquirys (照会への回答)
  app.post("/api/gemini/generate-conference-reply", async (req, res) => {
    try {
      const { clientName, caregiverName, inquiryText, caregiverNotes } = req.body;

      if (DEMO_MODE) {
        return res.json({ text: DEMO_CONFERENCE_REPLY });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const systemPrompt = `あなたは訪問介護事業所の管理者として、ケアマネジャーから送られてきた「サービス担当者会議 照会(欠席時回答書)」に回答する公的文書を作成するAIです。
日本の介護現場における正式で礼儀正しいビジネス文書(敬体、です・ます調)で、「照会事項」と「スタッフの活動・観察状況」に基づいた実用的で信頼のおける回答を作成してください。

回答すべき内容：
1. ケアプランに対する訪問介護事業所としての現状報告と意見
2. 照会事項（体調、食事、入浴、認知機能など）に対する直接の回答
3. 欠席することへの謝罪と、他機関・他サービスへの連携の提案

出力は日本の標準的なフォーマットを遵守した文章(Markdown)にしてください。`;

      const userPrompt = `
利用者の氏名: ${clientName}
対応スタッフ: ${caregiverName}
ケアマネジャーからの照会内容:
${inquiryText}

当事業所での最近の様子・特記事項:
${caregiverNotes}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Generate Conference Reply Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Interactive Main Page conversational AI Assistant
  app.post("/api/gemini/assistant-chat", async (req, res) => {
    try {
      const { messages, schedules, clients, staff } = req.body;

      if (DEMO_MODE) {
        const lastUserMessage = Array.isArray(messages)
          ? [...messages].reverse().find((m: any) => m.role === "user")
          : null;
        const userText = lastUserMessage?.parts?.[0]?.text || "";
        const text = selectAssistantDemoResponse(userText);
        return res.json({ text });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const systemPrompt = `あなたは訪問介護事業所の対話型AIアシスタント「ながらAI」です。
管理者の負担を減らし、訪問介護事業所の円滑な運営（スケジュール調整や突発的なキャンセル時の対応、スタッフへの代替訪問あてがい）をサポートするために存在します。

【前提知識とビジネス課題】
- 雇用状況: 当事業所には、単発（スポット）で働くパートのヘルパーから常勤まで様々なスタッフがいます。
- 給料: ヘルパーは訪問稼働時間に応じて給与が発生するため、急遽のキャンセル（例: 利用者の入院、デイサービス急用など）の時、稼働予定がなくなって給与が失われると非常に困ります。
- 管理者の仕事: 管理者は急なキャンセル対応のために、別の未割り当て枠やスポット需要（別利用者の予約）をキャンセルになった人に最優先であてがい、生活保障と効率的な運営を両立させる必要があります。
- 社内全体スケジュール: 前日にならないと最新の訪問スケジュールが確定しないため、常に全体スケジュールと「スタッフが今どこにいるか/誰が空いているか」を把握しなければなりません。

【アシスタントとしての行動指針】
1. 質問に対し、詳細かつ温かく日本語で回答してください。
2. スケジュール調整（未割り当て枠の解決や、急遽キャンセルされた枠を埋める代替ヘルパーの差配）を積極的に提案してください。
3. **提案時、1クリックで適用可能な具体的編集アクション**を、回答メッセージの一番下に以下のJSONコードブロック(1個の \`\`\`json と \`\`\` で囲まれた形式)として自動出力することができます。
   
   埋め込むJSONのフォーマット (必ず正規のJSONにしてください。複数アクションも可):
   \`\`\`json
   {
     "actions": [
       {
         "type": "reassign",
         "scheduleId": "変更対象のスケジュールID",
         "caregiverId": "あてがうスタッフのID",
         "caregiverName": "スタッフ名",
         "reason": "○○様枠をキャンセル救済として△△さんに割り当て変更します"
       }
     ]
   }
   \`\`\`

【現在のデータベース状況データ】
当社クライアント一覧: ${JSON.stringify(clients?.map((c: any) => ({ id: c.id, name: c.name, address: c.address })))}
当社スタッフ一覧: ${JSON.stringify(staff?.map((s: any) => ({ id: s.id, name: s.name })))}
本日の訪問スケジュール: ${JSON.stringify(schedules?.map((s: any) => ({ id: s.id, clientId: s.clientId, caregiverId: s.caregiverId, startTime: s.startTime, endTime: s.endTime, careType: s.careType, status: s.status })))}

「明日の予定調整やキャンセル救済を教えて」などの質問に対しては、
・statusが "cancelled" の案件があるかどうかチェックし、それによってお仕事が無くなった caregiverId に、
・未割り当て(caregiverIdが空、またはstatusが "planned")の別の訪問予定をあてがう。
という具体的な reassign アクションを提案に含めてJSON化してください。非常時やスポット枠の救済を重視する発言をしてください。`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: JSON.stringify(messages),
        config: {
          systemInstruction: systemPrompt,
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Assistant Chat Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Vite middleware for development, static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
