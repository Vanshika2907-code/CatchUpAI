import type { AnalysisResult } from '../types';
import { maskSensitiveText } from './privacyShield';

export function formatAnalysisForCopy(result: AnalysisResult): string {
  const lines = [
    'CatchUp AI Report',
    '',
    'Quick summary:',
    result.quickSummary,
    '',
    'Action items:',
    ...result.actionItems.map((item) => `- [${item.priority}] ${item.task} Owner: ${item.owner}. Deadline: ${item.deadline}.`),
    '',
    'Decisions:',
    ...result.decisions.map((item) => `- [${item.priority}] ${item.decision}`),
    '',
    'Important messages:',
    ...result.importantMessages.map((item) => `- [${item.priority}] ${item.title}: ${item.summary}`)
  ];
  const combined = lines.join('\n');
  return maskSensitiveText(combined).sanitizedText;
}

export async function copyText(text: string): Promise<void> {
  const sanitized = maskSensitiveText(text).sanitizedText;
  await navigator.clipboard.writeText(sanitized);
}
