import promptMarkdown from '../prompt.md?raw';

export const PROMPT_MARKDOWN = promptMarkdown;

export function buildAnalysisPrompt(transcript: string, chunkLabel: string): string {
  return `${promptMarkdown}

Scope: analyze this ${chunkLabel} only.

MESSAGES:
${transcript}

Return JSON only:`;
}
