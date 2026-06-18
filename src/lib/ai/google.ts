import { GoogleGenerativeAI } from '@google/generative-ai';

let _client: GoogleGenerativeAI | null = null;

export function getGoogleAI(): GoogleGenerativeAI {
  if (!_client) {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_API_KEY missing — set it in .env.local and Vercel production');
    }
    _client = new GoogleGenerativeAI(key);
  }
  return _client;
}

export const BIO_ASSIST_MODEL = 'gemini-2.5-flash-lite' as const;
