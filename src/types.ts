export type Priority = 'urgent' | 'important' | 'fyi';
export type Confidence = 'high' | 'medium' | 'low';

export interface ChatMessage {
  index: number;
  timestamp: string | null;
  sender: string | null;
  text: string;
  isSystem: boolean;
  raw: string;
}

export interface ChatStats {
  totalMessages: number;
  participantCount: number;
  systemMessages: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  textLength: number;
}

export interface Evidence {
  messageIndex: number;
  timestamp: string;
  sender: string;
  snippet: string;
}

export interface ImportantMessage {
  id: string;
  title: string;
  summary: string;
  priority: Priority;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface Decision {
  id: string;
  decision: string;
  priority: Priority;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface ActionItem {
  id: string;
  task: string;
  owner: string;
  deadline: string;
  priority: Priority;
  confidence: Confidence;
  commitmentType: 'explicit' | 'inferred' | 'suggestion';
  evidence: Evidence[];
}

export interface UnansweredQuestion {
  id: string;
  question: string;
  askedBy: string;
  priority: Priority;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface AnalysisResult {
  quickSummary: string;
  importantMessages: ImportantMessage[];
  decisions: Decision[];
  actionItems: ActionItem[];
  unansweredQuestions: UnansweredQuestion[];
  limitations: string[];
}

export interface ImportedChat {
  fileName: string;
  fileSize: number;
  rawText: string;
  messages: ChatMessage[];
  stats: ChatStats;
}

export type AnalyzerStatus =
  | 'idle'
  | 'loading-model'
  | 'analyzing'
  | 'validating'
  | 'complete'
  | 'error';
