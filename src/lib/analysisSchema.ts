import { z } from 'zod';
import type { AnalysisResult } from '../types';

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

export function parseModelJson(text: string): AnalysisResult {
  const jsonText = extractJson(text);
  const parsed = parseJsonObject(jsonText);
  return analysisResultSchema.parse(normalizeAnalysis(parsed));
}

export function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  throw new Error('The model did not return JSON.');
}

function parseJsonObject(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch {
    const withoutTrailingCommas = jsonText.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(withoutTrailingCommas);
  }
}

function normalizeAnalysis(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const report = value as Record<string, unknown>;

  return {
    quickSummary: stringOr(report.quickSummary, 'The local model returned an empty summary.'),
    importantMessages: normalizeItems(report.importantMessages, 'importantMessages'),
    decisions: normalizeItems(report.decisions, 'decisions'),
    actionItems: normalizeItems(report.actionItems, 'actionItems'),
    unansweredQuestions: normalizeItems(report.unansweredQuestions, 'unansweredQuestions'),
    limitations: Array.isArray(report.limitations) ? report.limitations.map((item) => String(item)) : []
  };
}

function normalizeItems(value: unknown, prefix: string): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const normalized = { ...(item as Record<string, unknown>) };
    normalized.id = stringOr(normalized.id, `${prefix}-${index + 1}`);
    normalized.priority = normalizePriority(normalized.priority);
    normalized.confidence = normalizeConfidence(normalized.confidence);
    normalized.evidence = Array.isArray(normalized.evidence) ? normalized.evidence : [];

    if (prefix === 'actionItems') {
      normalized.owner = stringOr(normalized.owner, 'unknown');
      normalized.deadline = stringOr(normalized.deadline, 'unknown');
      normalized.commitmentType = normalizeCommitmentType(normalized.commitmentType);
    }
    if (prefix === 'unansweredQuestions') {
      normalized.askedBy = stringOr(normalized.askedBy, 'unknown');
    }

    return normalized;
  });
}

function normalizePriority(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('urgent')) return 'urgent';
  if (normalized.includes('important')) return 'important';
  return 'fyi';
}

function normalizeConfidence(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('medium')) return 'medium';
  return 'low';
}

function normalizeCommitmentType(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('inferred')) return 'inferred';
  if (normalized.includes('suggestion')) return 'suggestion';
  return 'explicit';
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function emptyAnalysis(reason: string): AnalysisResult {
  return {
    quickSummary: 'No supported catch-up report could be generated.',
    importantMessages: [],
    decisions: [],
    actionItems: [],
    unansweredQuestions: [],
    limitations: [reason]
  };
}
