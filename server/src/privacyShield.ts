export type SensitiveCategory =
  | 'pin'
  | 'otp'
  | 'password'
  | 'api_key'
  | 'email'
  | 'phone'
  | 'financial'
  | 'gov_id'
  | 'address';

const API_KEY_PATTERNS = [
  /\b(sk-[a-zA-Z0-9_\-]{20,})\b/g,
  /\b(gh[pousr]_[a-zA-Z0-9]{36,})\b/g,
  /\b(AIzaSy[a-zA-Z0-9_\-]{33})\b/g,
  /\b(ey[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,})\b/g,
  /\b(AKIA[0-9A-Z]{16})\b/g,
  /\b(?:api[_\s-]?key|secret[_\s-]?key|access[_\s-]?token|auth[_\s-]?token|client[_\s-]?secret|bearer)\s*(?:is|[:=])\s*([a-zA-Z0-9_\-.+=/]{14,})\b/gi
];

const EMAIL_PATTERN = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

const CARD_PATTERNS = [
  /\b((?:4\d{3}|5[1-5]\d{2}|6011|65\d{2})[- ]?(?:\d{4}[- ]?){2}\d{4})\b/g,
  /\b(3[47]\d{2}[- ]?\d{6}[- ]?\d{5})\b/g,
  /\b([A-Z]{2}\d{2}[A-Z0-9]{4}[- ]?[A-Z0-9]{4}[- ]?[A-Z0-9]{4}[- ]?[A-Z0-9]{0,16})\b/g,
  /\b(?:account|acct|acc|routing)\s*(?:number|num|no|#)?\s*(?:is|[:=])\s*(\d{6,18})\b/gi
];

const GOV_ID_PATTERNS = [
  /\b(\d{3}-\d{2}-\d{4})\b/g,
  /\b(?:ssn|social\s*security|national\s*id|passport|aadhaar|pan)\s*(?:number|num|no|#)?\s*(?:is|[:=])\s*([a-zA-Z0-9-]{6,16})\b/gi
];

const PASSWORD_PATTERN = /\b(?:my\s+)?(?:password|passcode|passwd|pwd|passphrase)\s*(?:is|[:=])\s*([^\s,;.!?]+)/gi;

const PIN_PATTERNS = [
  /\b(?:my\s+)?(?:atm\s+|security\s+)?(?:pin|passcode|pass\s*code)\s*(?:code)?\s*(?:is|[:=]|\s)\s*(\d{4,8})\b/gi
];

const OTP_PATTERNS = [
  /\b(?:the\s+|your\s+|my\s+)?(?:otp|one-time\s*(?:password|passcode)|verification\s*code|security\s*code|login\s*code|auth\s*code)\s*(?:is|[:=]|\s)\s*([0-9]{4,8})\b/gi,
  /\b(?:your\s+)?code\s+(?:is|[:=])\s*([0-9]{4,8})\b/gi
];

const PHONE_PATTERNS = [
  /\+\d{1,3}[-.\s]?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5}\b/g,
  /\b(?:\(\d{3}\)[-.\s]?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/g,
  /\b(?:call|text|phone|mobile|tel|whatsapp|cell)\s*(?:me\s*at|at|:)?\s*(\+?[\d\s().-]{7,16})\b/gi
];

const ADDRESS_PATTERN =
  /\b(?:my\s+(?:home\s+)?address\s+is|lives?\s+at|located\s+at)\s+([0-9]+\s+[A-Za-z0-9\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Apartment|Apt|Suite|Floor|Building|Bldg)\b[^\n.!?]*)/gi;

export function maskSensitiveTextServer(text: string): string {
  if (!text) return text;
  let sanitized = text;

  // Mask API Keys
  for (const regex of API_KEY_PATTERNS) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, (m, g1) => {
      return g1 ? m.replace(g1, '[REDACTED_API_KEY]') : '[REDACTED_API_KEY]';
    });
  }

  // Passwords
  PASSWORD_PATTERN.lastIndex = 0;
  sanitized = sanitized.replace(PASSWORD_PATTERN, (m, g1) => {
    return g1 ? m.replace(g1, '*'.repeat(Math.max(4, g1.length))) : m;
  });

  // PINs
  for (const regex of PIN_PATTERNS) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, (m, g1) => {
      return g1 ? m.replace(g1, '*'.repeat(Math.max(4, g1.length))) : m;
    });
  }

  // OTPs
  for (const regex of OTP_PATTERNS) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, (m, g1) => {
      return g1 ? m.replace(g1, '*'.repeat(Math.max(4, g1.length))) : m;
    });
  }

  // Emails
  EMAIL_PATTERN.lastIndex = 0;
  sanitized = sanitized.replace(EMAIL_PATTERN, (m) => '*'.repeat(m.length));

  // Financial
  for (const regex of CARD_PATTERNS) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, (m, g1) => {
      return g1 ? m.replace(g1, '[REDACTED_FINANCIAL_INFO]') : '[REDACTED_FINANCIAL_INFO]';
    });
  }

  // Gov ID
  for (const regex of GOV_ID_PATTERNS) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, (m, g1) => {
      return g1 ? m.replace(g1, '[REDACTED_GOV_ID]') : '[REDACTED_GOV_ID]';
    });
  }

  // Phone
  for (const regex of PHONE_PATTERNS) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, (m, g1) => {
      return g1 ? m.replace(g1, '[REDACTED_PHONE]') : '[REDACTED_PHONE]';
    });
  }

  // Address
  ADDRESS_PATTERN.lastIndex = 0;
  sanitized = sanitized.replace(ADDRESS_PATTERN, (m, g1) => {
    return g1 ? m.replace(g1, '[REDACTED_ADDRESS]') : '[REDACTED_ADDRESS]';
  });

  return sanitized;
}

export function sanitizeAnalysisResultServer(result: any): any {
  if (!result || typeof result !== 'object') return result;

  const sanitizeString = (str: string): string => {
    if (!str || typeof str !== 'string') return str;
    return maskSensitiveTextServer(str);
  };

  const sanitizeEvidence = (evList: any[] = []): any[] => {
    return evList.map((ev) => ({
      ...ev,
      snippet: sanitizeString(ev.snippet)
    }));
  };

  return {
    ...result,
    quickSummary: sanitizeString(result.quickSummary || ''),
    importantMessages: Array.isArray(result.importantMessages)
      ? result.importantMessages.map((item: any) => ({
          ...item,
          title: sanitizeString(item.title || ''),
          summary: sanitizeString(item.summary || ''),
          evidence: sanitizeEvidence(item.evidence)
        }))
      : [],
    decisions: Array.isArray(result.decisions)
      ? result.decisions.map((item: any) => ({
          ...item,
          decision: sanitizeString(item.decision || ''),
          evidence: sanitizeEvidence(item.evidence)
        }))
      : [],
    actionItems: Array.isArray(result.actionItems)
      ? result.actionItems.map((item: any) => ({
          ...item,
          task: sanitizeString(item.task || ''),
          owner: sanitizeString(item.owner || ''),
          deadline: sanitizeString(item.deadline || ''),
          evidence: sanitizeEvidence(item.evidence)
        }))
      : [],
    unansweredQuestions: Array.isArray(result.unansweredQuestions)
      ? result.unansweredQuestions.map((item: any) => ({
          ...item,
          question: sanitizeString(item.question || ''),
          askedBy: sanitizeString(item.askedBy || ''),
          evidence: sanitizeEvidence(item.evidence)
        }))
      : [],
    limitations: Array.isArray(result.limitations)
      ? result.limitations.map((lim: string) => sanitizeString(lim))
      : []
  };
}
