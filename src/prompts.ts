import promptMarkdown from '../prompt.md?raw';

export const PROMPT_MARKDOWN = promptMarkdown;

export function buildAnalysisPrompt(transcript: string, chunkLabel: string): string {
  return `${promptMarkdown}

Analyze this ${chunkLabel} WhatsApp export excerpt.
Return one valid JSON object only. Do not include Markdown, explanation, or text before/after the JSON.
Use this exact top-level shape:
{"quickSummary":"","importantMessages":[],"decisions":[],"actionItems":[],"unansweredQuestions":[],"limitations":[]}

MESSAGES:
${transcript}

JSON:`;
}
