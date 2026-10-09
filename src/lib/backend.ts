import type { AnalysisResult } from '../types';

export interface HealthResponse {
  ok: boolean;
  service: string;
  mode: 'local-browser-ai' | 'server-gemini';
  geminiConfigured: boolean;
  geminiModel: string;
  serverLocalAiEnabled: boolean;
  timestamp: string;
}

export interface AnalyzeWithGeminiRequest {
  messageCount: number;
  textLength: number;
  transcript: string;
}

export async function getBackendHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export async function analyzeWithGemini(request: AnalyzeWithGeminiRequest): Promise<AnalysisResult> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      mode: 'server-gemini',
      ...request
    })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? 'Gemini analysis failed.');
  }

  return data.result as AnalysisResult;
}
