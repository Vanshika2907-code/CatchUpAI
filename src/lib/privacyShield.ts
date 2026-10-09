import type { ChatMessage, Evidence } from '../types';

export type SensitiveCategory =
  | 'pin'
  | 'otp'
  | 'password'
  | 'api_key'
  | 'email'
  | 'phone'
  | 'financial'
  | 'gov_id'
  | 'address'
  | 'custom';

export interface SensitiveDetection {
  category: SensitiveCategory;
  raw: string;
  masked: string;
  startIndex: number;
  endIndex: number;
  reason: string;
}

export interface MaskResult {
  originalText: string;
  sanitizedText: string;
  detections: SensitiveDetection[];
}

export interface PrivacyReport {
  totalDetections: number;
  categoryCounts: Record<SensitiveCategory, number>;
  detections: SensitiveDetection[];
}

// 1. API Keys & Secrets
const API_KEY_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // OpenAI & general sk- tokens (matches sk-abc123... and longer)
  { regex: /\b(sk-[a-zA-Z0-9_\-]{6,})\b/g, reason: 'OpenAI-style API key' },
  // GitHub tokens
  { regex: /\b(gh[pousr]_[a-zA-Z0-9]{36,})\b/g, reason: 'GitHub access token' },
  // Google API keys
  { regex: /\b(AIzaSy[a-zA-Z0-9_\-]{33})\b/g, reason: 'Google Cloud / Maps API key' },
  // JWT tokens
  { regex: /\b(ey[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,})\b/g, reason: 'JSON Web Token (JWT)' },
  // AWS Access Key ID
  { regex: /\b(AKIA[0-9A-Z]{16})\b/g, reason: 'AWS Access Key ID' },
  // Context-driven generic API keys and bearer tokens
  {
    regex: /\b(?:api[_\s-]?key|secret[_\s-]?key|access[_\s-]?token|auth[_\s-]?token|client[_\s-]?secret|bearer)\s*(?:is|[:=])\s*([a-zA-Z0-9_\-.+=/]{6,})\b/gi,
    reason: 'Explicit API key or secret token context'
  }
];

// 2. Email pattern
const EMAIL_PATTERN = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

// 3. Credit Cards & Bank/IBAN
const CARD_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // 16-digit cards with optional spaces or dashes (Visa, Mastercard, Discover, etc.)
  { regex: /\b((?:4\d{3}|5[1-5]\d{2}|6011|65\d{2})[- ]?(?:\d{4}[- ]?){2}\d{4})\b/g, reason: 'Credit/debit card number' },
  // 15-digit Amex cards
  { regex: /\b(3[47]\d{2}[- ]?\d{6}[- ]?\d{5})\b/g, reason: 'American Express card number' },
  // Generic 13-19 digit card pattern
  { regex: /\b(\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4})\b/g, reason: 'Card number format' },
  // IBAN
  { regex: /\b([A-Z]{2}\d{2}[A-Z0-9]{4}[- ]?[A-Z0-9]{4}[- ]?[A-Z0-9]{4}[- ]?[A-Z0-9]{0,16})\b/g, reason: 'IBAN bank account number' },
  // Bank Account with explicit context
  {
    regex: /\b(?:account|acct|acc|routing)\s*(?:number|num|no|#)?\s*(?:is|[:=])\s*(\d{6,18})\b/gi,
    reason: 'Bank account/routing identifier'
  }
];

// 4. Government IDs & SSN
const GOV_ID_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // US SSN
  { regex: /\b(\d{3}-\d{2}-\d{4})\b/g, reason: 'US Social Security Number (SSN)' },
  // Context-driven SSN / National ID
  {
    regex: /\b(?:ssn|social\s*security|national\s*id|passport|aadhaar|pan)\s*(?:number|num|no|#)?\s*(?:is|[:=])\s*([a-zA-Z0-9-]{6,16})\b/gi,
    reason: 'Government identification number'
  }
];

// 5. Context-driven Passwords
const PASSWORD_PATTERN =
  /\b(?:my\s+)?(?:password|passwd|pwd|passphrase)\s*(?:is|[:=])\s*([^\s,;.!?]+)/gi;

// 6. Context-driven PINs & Passcodes (Strict context to avoid masking ordinary years or quantities)
const PIN_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // "My PIN is 1234", "PIN: 4321", "security PIN is 8765", "passcode is 1234", "PIN 1234"
  {
    regex: /\b(?:my\s+)?(?:atm\s+|security\s+)?(?:pin|passcode|pass\s*code)\s*(?:code)?\s*(?:is|[:=]|\s)\s*(\d{4,8})\b/gi,
    reason: 'Personal Identification Number (PIN) / Passcode'
  }
];

// 7. Context-driven OTPs & Verification Codes
const OTP_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // "The OTP is 582941", "OTP: 123456", "OTP 889900", "verification code is 4928"
  {
    regex: /\b(?:the\s+|your\s+|my\s+)?(?:otp|one-time\s*(?:password|passcode)|verification\s*code|security\s*code|login\s*code|auth\s*code)\s*(?:is|[:=]|\s)\s*([0-9]{4,8})\b/gi,
    reason: 'One-Time Password (OTP) / Verification Code'
  },
  // "code is 123456", "your code is 123456"
  {
    regex: /\b(?:your\s+)?code\s+(?:is|[:=])\s*([0-9]{4,8})\b/gi,
    reason: 'Verification code phrase'
  }
];

// 8. Phone Numbers
// Matches phone numbers with country codes or formatted digits
const PHONE_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // International with + country code: e.g., +1 (555) 123-4567, +91 9876543210, +44 7911 123456
  {
    regex: /\+\d{1,3}[-.\s]?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5}\b/g,
    reason: 'International phone number'
  },
  // US / formatted national numbers: (555) 123-4567, 555-123-4567
  {
    regex: /\b(?:\(\d{3}\)[-.\s]?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/g,
    reason: 'Formatted telephone number'
  },
  // Explicit phone context: "call me at 9876543210", "phone: 5551234567"
  {
    regex: /\b(?:call|text|phone|mobile|tel|whatsapp|cell)\s*(?:me\s*at|at|:)?\s*(\+?[\d\s().-]{7,16})\b/gi,
    reason: 'Contextual phone number'
  }
];

// 9. Physical Street Addresses
const ADDRESS_PATTERN =
  /\b(?:(?:(?:my\s+)?(?:home\s+)?address\s*(?:is|[:=]))|lives?\s+at|located\s+at|deliver\s+to|send\s+(?:it\s+)?to)\s+([0-9]+\s+[A-Za-z0-9\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Circle|Cir|Terrace|Place|Pl|Apartment|Apt|Suite|Floor|Building|Bldg)\b[^\n.!?]*)/gi;

/**
 * Mask text using custom masking style matching the category.
 */
function createMask(category: SensitiveCategory, rawValue: string): string {
  switch (category) {
    case 'pin':
    case 'otp':
    case 'password':
      // Mask secret characters with asterisks matching length (e.g. 1234 -> ****)
      return '*'.repeat(Math.max(4, rawValue.length));
    case 'email':
      // Mask email completely with asterisks matching length
      return '*'.repeat(rawValue.length);
    case 'api_key':
      return '[REDACTED_API_KEY]';
    case 'financial':
      return '[REDACTED_FINANCIAL_INFO]';
    case 'gov_id':
      return '[REDACTED_GOV_ID]';
    case 'phone':
      return '[REDACTED_PHONE]';
    case 'address':
      return '[REDACTED_ADDRESS]';
    case 'custom':
      return '[REDACTED_PRIVATE]';
    default:
      return '[REDACTED]';
  }
}

interface Span {
  start: number;
  end: number;
  category: SensitiveCategory;
  raw: string;
  masked: string;
  reason: string;
}

/**
 * Detects sensitive spans and returns sanitized text along with detection metadata.
 * Designed to NEVER throw, even on malformed inputs.
 */
export function maskSensitiveText(text: string, customTerms: string[] = []): MaskResult {
  if (!text) {
    return { originalText: text, sanitizedText: text, detections: [] };
  }

  const spans: Span[] = [];

  // Helper to record spans
  function addSpan(
    start: number,
    end: number,
    category: SensitiveCategory,
    raw: string,
    reason: string,
    customMask?: string
  ) {
    if (start < 0 || end <= start) return;
    const masked = customMask ?? createMask(category, raw);
    spans.push({ start, end, category, raw, masked, reason });
  }

  // A. User-defined custom sensitive terms
  for (const term of customTerms) {
    if (!term || term.trim().length === 0) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      addSpan(match.index, match.index + match[0].length, 'custom', match[0], 'User-defined private term');
    }
  }

  // B. API Keys & Access Tokens
  for (const { regex, reason } of API_KEY_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // If capturing group exists, mask just the key; otherwise full match
      const targetStr = match[1] ?? match[0];
      const offset = match[1] ? match[0].indexOf(match[1]) : 0;
      const start = match.index + offset;
      addSpan(start, start + targetStr.length, 'api_key', targetStr, reason);
    }
  }

  // C. Passwords
  PASSWORD_PATTERN.lastIndex = 0;
  let pwdMatch: RegExpExecArray | null;
  while ((pwdMatch = PASSWORD_PATTERN.exec(text)) !== null) {
    if (pwdMatch[1]) {
      const offset = pwdMatch[0].lastIndexOf(pwdMatch[1]);
      const start = pwdMatch.index + offset;
      addSpan(start, start + pwdMatch[1].length, 'password', pwdMatch[1], 'Context-defined password');
    }
  }

  // D. PINs
  for (const { regex, reason } of PIN_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const targetStr = match[1] ?? match[0];
      const offset = match[1] ? match[0].lastIndexOf(match[1]) : 0;
      const start = match.index + offset;
      addSpan(start, start + targetStr.length, 'pin', targetStr, reason);
    }
  }

  // E. OTPs
  for (const { regex, reason } of OTP_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const targetStr = match[1] ?? match[0];
      const offset = match[1] ? match[0].lastIndexOf(match[1]) : 0;
      const start = match.index + offset;
      addSpan(start, start + targetStr.length, 'otp', targetStr, reason);
    }
  }

  // F. Emails
  EMAIL_PATTERN.lastIndex = 0;
  let emailMatch: RegExpExecArray | null;
  while ((emailMatch = EMAIL_PATTERN.exec(text)) !== null) {
    addSpan(emailMatch.index, emailMatch.index + emailMatch[0].length, 'email', emailMatch[0], 'Email address');
  }

  // G. Financial cards & bank info
  for (const { regex, reason } of CARD_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const targetStr = match[1] ?? match[0];
      const offset = match[1] ? match[0].lastIndexOf(match[1]) : 0;
      const start = match.index + offset;
      addSpan(start, start + targetStr.length, 'financial', targetStr, reason);
    }
  }

  // H. Government IDs & SSN
  for (const { regex, reason } of GOV_ID_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const targetStr = match[1] ?? match[0];
      const offset = match[1] ? match[0].lastIndexOf(match[1]) : 0;
      const start = match.index + offset;
      addSpan(start, start + targetStr.length, 'gov_id', targetStr, reason);
    }
  }

  // I. Phone Numbers
  for (const { regex, reason } of PHONE_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const targetStr = (match[1] ?? match[0]).trim();
      const offset = match[0].indexOf(targetStr);
      const start = match.index + (offset >= 0 ? offset : 0);
      addSpan(start, start + targetStr.length, 'phone', targetStr, reason);
    }
  }

  // J. Addresses
  ADDRESS_PATTERN.lastIndex = 0;
  let addrMatch: RegExpExecArray | null;
  while ((addrMatch = ADDRESS_PATTERN.exec(text)) !== null) {
    if (addrMatch[1]) {
      const targetStr = addrMatch[1].trim();
      const offset = addrMatch[0].indexOf(targetStr);
      const start = addrMatch.index + (offset >= 0 ? offset : 0);
      addSpan(start, start + targetStr.length, 'address', targetStr, 'Street address');
    }
  }

  if (spans.length === 0) {
    return { originalText: text, sanitizedText: text, detections: [] };
  }

  // Sort spans by start index, then longer spans first
  spans.sort((a, b) => a.start - b.start || b.end - a.end);

  // Merge overlapping or nested spans
  const nonOverlapping: Span[] = [];
  let currentEnd = -1;

  for (const span of spans) {
    if (span.start >= currentEnd) {
      nonOverlapping.push(span);
      currentEnd = span.end;
    }
  }

  // Construct sanitized string
  let result = '';
  let lastIndex = 0;
  const detections: SensitiveDetection[] = [];

  for (const span of nonOverlapping) {
    result += text.slice(lastIndex, span.start);
    result += span.masked;
    lastIndex = span.end;

    detections.push({
      category: span.category,
      raw: span.raw,
      masked: span.masked,
      startIndex: span.start,
      endIndex: span.end,
      reason: span.reason
    });
  }

  result += text.slice(lastIndex);

  return {
    originalText: text,
    sanitizedText: result,
    detections
  };
}

/**
 * Sanitizes a single ChatMessage.
 * Returns a cloned ChatMessage with masked text/raw and its detections.
 */
export function sanitizeChatMessage(
  message: ChatMessage,
  customTerms: string[] = []
): { sanitizedMessage: ChatMessage; detections: SensitiveDetection[] } {
  const textResult = maskSensitiveText(message.text, customTerms);
  const rawResult = maskSensitiveText(message.raw, customTerms);

  const sanitizedMessage: ChatMessage = {
    ...message,
    text: textResult.sanitizedText,
    raw: rawResult.sanitizedText
  };

  return {
    sanitizedMessage,
    detections: textResult.detections
  };
}

/**
 * Sanitizes an entire conversation before any AI processing or LLM calls.
 * Maintains original messages separate from sanitized messages in memory.
 */
export function sanitizeConversation(
  messages: ChatMessage[],
  customTerms: string[] = []
): { sanitizedMessages: ChatMessage[]; privacyReport: PrivacyReport } {
  const sanitizedMessages: ChatMessage[] = [];
  const allDetections: SensitiveDetection[] = [];

  const categoryCounts: Record<SensitiveCategory, number> = {
    pin: 0,
    otp: 0,
    password: 0,
    api_key: 0,
    email: 0,
    phone: 0,
    financial: 0,
    gov_id: 0,
    address: 0,
    custom: 0
  };

  for (const msg of messages) {
    const { sanitizedMessage, detections } = sanitizeChatMessage(msg, customTerms);
    sanitizedMessages.push(sanitizedMessage);

    for (const d of detections) {
      allDetections.push(d);
      categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
    }
  }

  const privacyReport: PrivacyReport = {
    totalDetections: allDetections.length,
    categoryCounts,
    detections: allDetections
  };

  return {
    sanitizedMessages,
    privacyReport
  };
}

/**
 * Deep secondary sanitization pass on AI AnalysisResult.
 * Ensures the model output never reintroduces, leaks, or echoes unmasked secrets.
 */
export function sanitizeAnalysisResult(
  result: any,
  customTerms: string[] = []
): any {
  if (!result || typeof result !== 'object') return result;

  const sanitizeString = (str: string): string => {
    if (!str || typeof str !== 'string') return str;
    return maskSensitiveText(str, customTerms).sanitizedText;
  };

  const sanitizeEvidence = (evList: Evidence[] = []): Evidence[] => {
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
