import type { AnalysisResult, AnalyzerStatus, ChatMessage } from '../types';
import { buildExtractiveAnalysis } from './extractiveAnalysis';

export interface AnalyzerUpdate {
  status: AnalyzerStatus;
  detail?: string;
  progress?: number;
}

export async function analyzeLocally(
  messages: ChatMessage[],
  onUpdate: (update: AnalyzerUpdate) => void
): Promise<AnalysisResult> {
  onUpdate({ status: 'analyzing', detail: 'Reading conversation messages...', progress: 15 });
  await new Promise((resolve) => setTimeout(resolve, 80));

  onUpdate({
    status: 'analyzing',
    detail: `Processing all ${messages.length.toLocaleString()} messages locally...`,
    progress: 45
  });
  await new Promise((resolve) => setTimeout(resolve, 120));

  onUpdate({ status: 'validating', detail: 'Extracting decisions, action items, and priorities...', progress: 75 });
  await new Promise((resolve) => setTimeout(resolve, 100));

  onUpdate({ status: 'validating', detail: 'Synthesizing catch-up report...', progress: 90 });
  await new Promise((resolve) => setTimeout(resolve, 80));

  const result = buildExtractiveAnalysis(messages, 'Processed 100% locally in your browser.');
  onUpdate({ status: 'complete', detail: 'Analysis complete', progress: 100 });
  return result;
}
