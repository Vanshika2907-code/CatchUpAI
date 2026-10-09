import type { AnalysisResult } from '../types';

export function mergeAnalyses(results: AnalysisResult[]): AnalysisResult {
  if (results.length === 1) return results[0];

  return {
    quickSummary: results.map((result) => result.quickSummary).filter(Boolean).join(' '),
    importantMessages: dedupeByText(results.flatMap((result) => result.importantMessages), (item) => item.title),
    decisions: dedupeByText(results.flatMap((result) => result.decisions), (item) => item.decision),
    actionItems: dedupeByText(results.flatMap((result) => result.actionItems), (item) => item.task),
    unansweredQuestions: dedupeByText(
      results.flatMap((result) => result.unansweredQuestions),
      (item) => item.question
    ),
    limitations: [
      ...new Set([
        ...results.flatMap((result) => result.limitations),
        'Long conversation analyzed in chunks and merged locally.'
      ])
    ]
  };
}

function dedupeByText<T>(items: T[], selector: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = selector(item).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
