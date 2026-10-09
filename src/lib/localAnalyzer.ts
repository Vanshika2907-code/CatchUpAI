import type { AnalysisResult, AnalyzerStatus, ChatMessage } from '../types';
import { buildExtractiveAnalysis } from './extractiveAnalysis';
import { sanitizeAnalysisResult } from './privacyShield';

export interface AnalyzerUpdate {
  status: AnalyzerStatus;
  detail?: string;
  progress?: number;
}

export async function analyzeLocally(
  messages: ChatMessage[],
  onUpdate: (update: AnalyzerUpdate) => void
): Promise<AnalysisResult> {
  onUpdate({ status: 'analyzing', detail: 'Running Privacy Shield and reading messages...', progress: 15 });
  await new Promise((resolve) => setTimeout(resolve, 80));

  onUpdate({
    status: 'analyzing',
    detail: `Processing all ${messages.length.toLocaleString()} messages locally...`,
    progress: 45
  });
  await new Promise((resolve) => setTimeout(resolve, 120));

  onUpdate({ status: 'validating', detail: 'Extracting decisions, action items, and priorities...', progress: 75 });
  await new Promise((resolve) => setTimeout(resolve, 100));

  onUpdate({ status: 'validating', detail: 'Synthesizing report & enforcing Privacy Shield output check...', progress: 90 });
  await new Promise((resolve) => setTimeout(resolve, 80));

  const rawResult = buildExtractiveAnalysis(messages, 'Processed 100% locally in your browser with Privacy Shield protection.');
  const result = sanitizeAnalysisResult(rawResult);
  onUpdate({ status: 'complete', detail: 'Analysis complete', progress: 100 });
  return result;
}
