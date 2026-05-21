// Vercel Functions 用の共通ロジック
// ===============================================================
// .env / Vercel環境変数:
//   GEMINI_API_KEY  - Gemini API キー
//   DEMO_MODE       - true なら事前応答を返す（無料枠制限回避）
// ===============================================================

import { GoogleGenAI } from '@google/genai';
import {
  selectAssistantDemoResponse,
  DEMO_CAREPLAN_PARSE,
  DEMO_MONITORING,
  DEMO_CONFERENCE_REPLY,
  DEMO_GENERIC,
} from '../../src/lib/demoResponses';

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

export {
  selectAssistantDemoResponse,
  DEMO_CAREPLAN_PARSE,
  DEMO_MONITORING,
  DEMO_CONFERENCE_REPLY,
  DEMO_GENERIC,
};
