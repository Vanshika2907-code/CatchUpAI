import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { parseModelJson, type AnalysisResult } from './analysisSchema.js';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

let promptMarkdown: string | null = null;

export async function analyzeWithGemini(transcript: string): Promise<AnalysisResult> {
  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const prompt = await buildAnalysisPrompt(transcript);
  const modelPath = config.GEMINI_MODEL.startsWith('models/') ? config.GEMINI_MODEL : `models/${config.GEMINI_MODEL}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })
  });

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Gemini request failed with status ${response.status}.`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return parseModelJson(text);
}

async function buildAnalysisPrompt(transcript: string): Promise<string> {
  const prompt = await getPromptMarkdown();
  return `${prompt}

Analyze this WhatsApp export and return JSON only.

MESSAGES:
${transcript}`;
}

async function getPromptMarkdown(): Promise<string> {
  promptMarkdown ??= await readFile(join(process.cwd(), 'prompt.md'), 'utf8');
  return promptMarkdown;
}
