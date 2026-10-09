import type { AnalysisResult, ChatMessage, Confidence, Evidence, Priority } from '../types';

const IMPORTANT_PATTERN =
  /\b(urgent|important|asap|deadline|due|today|tomorrow|tonight|blocked|issue|problem|meeting|call|plan|update|confirm|confirmed|decided|approved|cancelled|rescheduled)\b/i;
const ACTION_PATTERN =
  /\b(can you|could you|please|pls|need you to|send|share|review|finish|complete|call|book|confirm|check|remind|bring|prepare|update)\b/i;
const DECISION_PATTERN = /\b(decided|confirmed|agreed|approved|cancelled|canceled|rescheduled|final|we will|we'll|let's)\b/i;
const URGENT_PATTERN = /\b(urgent|asap|today|tomorrow|tonight|now|deadline|blocked|emergency)\b/i;

export function buildExtractiveAnalysis(messages: ChatMessage[], reason: string): AnalysisResult {
  const visibleMessages = messages.filter((message) => message.text.trim());
  const conversationalMessages = visibleMessages.filter((message) => !message.isSystem);
  const importantCandidates = conversationalMessages.filter((message) => IMPORTANT_PATTERN.test(message.text));
  const actionCandidates = conversationalMessages.filter((message) => ACTION_PATTERN.test(message.text));
  const decisionCandidates = conversationalMessages.filter((message) => DECISION_PATTERN.test(message.text));
  const questionCandidates = conversationalMessages.filter((message) => isQuestion(message.text));

  return {
    quickSummary: buildSummary(conversationalMessages),
    importantMessages: importantCandidates.slice(0, 30).map((message, index) => ({
      id: `important-${message.index}-${index + 1}`,
      title: summarizeTitle(message.text),
      summary: summarizeSentence(message.text),
      priority: priorityFor(message.text),
      confidence: confidenceFor(message.text),
      evidence: [evidenceFor(message)]
    })),
    decisions: decisionCandidates.slice(0, 25).map((message, index) => ({
      id: `decision-${message.index}-${index + 1}`,
      decision: summarizeSentence(message.text),
      priority: priorityFor(message.text),
      confidence: confidenceFor(message.text),
      evidence: [evidenceFor(message)]
    })),
    actionItems: actionCandidates.slice(0, 30).map((message, index) => ({
      id: `action-${message.index}-${index + 1}`,
      task: summarizeSentence(message.text),
      owner: inferOwner(message),
      deadline: inferDeadline(message.text),
      priority: priorityFor(message.text),
      confidence: confidenceFor(message.text),
      commitmentType: 'inferred',
      evidence: [evidenceFor(message)]
    })),
    unansweredQuestions: questionCandidates.slice(-25).map((message, index) => ({
      id: `question-${message.index}-${index + 1}`,
      question: summarizeQuestion(message.text),
      askedBy: message.sender ?? 'unknown',
      priority: priorityFor(message.text),
      confidence: 'low',
      evidence: [evidenceFor(message)]
    })),
    limitations: [
      'CatchUp AI processed this conversation locally in your browser using a keyword-based local fallback.',
      reason
    ]
  };
}

function buildSummary(messages: ChatMessage[]): string {
  const participants = new Set(messages.map((message) => message.sender).filter(Boolean));
  const sample = messages.find((message) => IMPORTANT_PATTERN.test(message.text)) ?? messages[0];
  const participantText = participants.size > 0 ? `${participants.size} participant${participants.size === 1 ? '' : 's'}` : 'the chat';
  if (!sample) return 'No conversational messages were available to summarize.';
  return `Analyzed ${messages.length} message${messages.length === 1 ? '' : 's'} from ${participantText}. Key local signals include: ${summarizeSentence(sample.text)}`;
}

function evidenceFor(message: ChatMessage): Evidence {
  return {
    messageIndex: message.index,
    timestamp: message.timestamp ?? 'unknown',
    sender: message.isSystem ? 'system' : message.sender ?? 'unknown',
    snippet: truncate(message.text.replace(/\s+/g, ' '), 220)
  };
}

function priorityFor(text: string): Priority {
  if (URGENT_PATTERN.test(text)) return 'urgent';
  if (IMPORTANT_PATTERN.test(text) || ACTION_PATTERN.test(text) || DECISION_PATTERN.test(text)) return 'important';
  return 'fyi';
}

function confidenceFor(text: string): Confidence {
  if (URGENT_PATTERN.test(text) || DECISION_PATTERN.test(text)) return 'medium';
  return 'low';
}

function inferOwner(message: ChatMessage): string {
  if (/\b(i will|i'll|i can|i am going to|i'm going to)\b/i.test(message.text)) return message.sender ?? 'unknown';
  return 'unknown';
}

function inferDeadline(text: string): string {
  const match = text.match(/\b(today|tomorrow|tonight|by\s+\w+|before\s+\w+|after\s+\w+|\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i);
  return match?.[0] ?? 'unknown';
}

function isQuestion(text: string): boolean {
  return text.includes('?') || /^(who|what|when|where|why|how|can|could|will|should|do|does|did|is|are)\b/i.test(text.trim());
}

function summarizeTitle(text: string): string {
  return truncate(summarizeSentence(text), 80);
}

function summarizeQuestion(text: string): string {
  const question = text
    .split(/(?<=\?)/)
    .map((part) => part.trim())
    .find(Boolean);
  return truncate(question ?? summarizeSentence(text), 220);
}

function summarizeSentence(text: string): string {
  const sentence = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find(Boolean);
  return truncate(sentence ?? text.trim(), 240);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}
