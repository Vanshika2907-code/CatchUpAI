import { z } from 'zod';

const prioritySchema = z.enum(['urgent', 'important', 'fyi']);
const confidenceSchema = z.enum(['high', 'medium', 'low']);

const evidenceSchema = z.object({
  messageIndex: z.coerce.number().int().nonnegative(),
  timestamp: z.string().default('unknown'),
  sender: z.string().default('unknown'),
  snippet: z.string().max(360).default('')
});

export const analysisResultSchema = z.object({
  quickSummary: z.string().min(1).max(1800),
  importantMessages: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(140),
        summary: z.string().min(1).max(700),
        priority: prioritySchema,
        confidence: confidenceSchema,
        evidence: z.array(evidenceSchema).default([])
      })
    )
    .default([]),
  decisions: z
    .array(
      z.object({
        id: z.string().min(1),
        decision: z.string().min(1).max(700),
        priority: prioritySchema,
        confidence: confidenceSchema,
        evidence: z.array(evidenceSchema).default([])
      })
    )
    .default([]),
  actionItems: z
    .array(
      z.object({
        id: z.string().min(1),
        task: z.string().min(1).max(700),
        owner: z.string().default('unknown'),
        deadline: z.string().default('unknown'),
        priority: prioritySchema,
        confidence: confidenceSchema,
        commitmentType: z.enum(['explicit', 'inferred', 'suggestion']).default('explicit'),
        evidence: z.array(evidenceSchema).default([])
      })
    )
    .default([]),
  unansweredQuestions: z
    .array(
      z.object({
        id: z.string().min(1),
        question: z.string().min(1).max(500),
        askedBy: z.string().default('unknown'),
        priority: prioritySchema,
        confidence: confidenceSchema,
        evidence: z.array(evidenceSchema).default([])
      })
    )
    .default([]),
  limitations: z.array(z.string().max(300)).default([])
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export function parseModelJson(text: string): AnalysisResult {
  const jsonText = extractJson(text);
  const parsed = JSON.parse(jsonText);
  return analysisResultSchema.parse(parsed);
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  throw new Error('Gemini did not return JSON.');
}
