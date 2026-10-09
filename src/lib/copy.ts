import type { AnalysisResult } from '../types';

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
  return lines.join('\n');
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
