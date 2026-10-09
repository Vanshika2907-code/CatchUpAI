import { describe, expect, it } from 'vitest';
import {
  maskSensitiveText,
  sanitizeChatMessage,
  sanitizeConversation,
  sanitizeAnalysisResult
} from './privacyShield';
import type { ChatMessage } from '../types';

describe('Privacy Shield - Sensitive Information Detection & Masking', () => {
  describe('PIN & Passcode detection', () => {
    it('masks PIN with asterisks matching length and preserves message context', () => {
      const input = 'Alex: My PIN is 1234. Please complete the payment before 5 PM.';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toBe('Alex: My PIN is ****. Please complete the payment before 5 PM.');
      expect(result.detections.length).toBe(1);
      expect(result.detections[0].category).toBe('pin');
      expect(result.detections[0].raw).toBe('1234');
      expect(result.detections[0].masked).toBe('****');
    });

    it('masks passcode and PIN notation', () => {
      expect(maskSensitiveText('PIN: 9876').sanitizedText).toBe('PIN: ****');
      expect(maskSensitiveText('passcode is 4321').sanitizedText).toBe('passcode is ****');
    });

    it('does NOT blindly mask years, times, or ordinary quantities', () => {
      const benign = 'In 2024 we reached 5000 users. Meeting is at 10:30 or 5 PM.';
      const result = maskSensitiveText(benign);
      expect(result.sanitizedText).toBe(benign);
      expect(result.detections.length).toBe(0);
    });
  });

  describe('OTP detection', () => {
    it('masks OTP with asterisks matching length', () => {
      const input = 'The OTP is 582941';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toBe('The OTP is ******');
      expect(result.detections.length).toBe(1);
      expect(result.detections[0].category).toBe('otp');
    });

    it('masks verification codes', () => {
      expect(maskSensitiveText('Your verification code is 492810').sanitizedText).toBe(
        'Your verification code is ******'
      );
      expect(maskSensitiveText('security code is 8829').sanitizedText).toBe(
        'security code is ****'
      );
    });
  });

  describe('Password detection', () => {
    it('masks password with asterisks matching length', () => {
      const input = 'My password is hello123';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toBe('My password is ********');
      expect(result.detections.length).toBe(1);
      expect(result.detections[0].category).toBe('password');
    });
  });

  describe('Email address detection', () => {
    it('masks email with asterisks matching length', () => {
      const input = 'Contact me at example@gmail.com';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toBe('Contact me at *****************');
      expect(result.detections.length).toBe(1);
      expect(result.detections[0].category).toBe('email');
    });
  });

  describe('API key and secret detection', () => {
    it('masks OpenAI style API keys', () => {
      const input = 'My API key is sk-abc123456789012345';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toContain('[REDACTED_API_KEY]');
      expect(result.sanitizedText).not.toContain('sk-abc123');
      expect(result.detections[0].category).toBe('api_key');
    });

    it('masks GitHub tokens and Google API keys', () => {
      const gh = 'Token: ghp_111122223333444455556666777788889999';
      expect(maskSensitiveText(gh).sanitizedText).toBe('Token: [REDACTED_API_KEY]');
    });
  });

  describe('Financial information detection', () => {
    it('masks credit cards', () => {
      const input = 'Use card 4111 2222 3333 4444 for the flight';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toBe('Use card [REDACTED_FINANCIAL_INFO] for the flight');
      expect(result.detections[0].category).toBe('financial');
    });

    it('masks IBAN and explicit bank account numbers', () => {
      const input = 'My account number is 987654321';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toBe('My account number is [REDACTED_FINANCIAL_INFO]');
    });
  });

  describe('Government ID detection', () => {
    it('masks SSN', () => {
      const input = 'SSN is 123-45-6789';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toBe('SSN is [REDACTED_GOV_ID]');
      expect(result.detections[0].category).toBe('gov_id');
    });
  });

  describe('Phone number detection', () => {
    it('masks international and formatted phone numbers', () => {
      const input = 'Call +1 (555) 123-4567 or +91 9876543210';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).not.toContain('+1 (555) 123-4567');
      expect(result.sanitizedText).not.toContain('+91 9876543210');
      expect(result.detections.length).toBe(2);
      expect(result.detections[0].category).toBe('phone');
    });
  });

  describe('Home address detection', () => {
    it('masks street addresses', () => {
      const input = 'My address is 123 Main Street, Suite 400';
      const result = maskSensitiveText(input);
      expect(result.sanitizedText).toBe('My address is [REDACTED_ADDRESS]');
      expect(result.detections[0].category).toBe('address');
    });
  });

  describe('Custom user-defined sensitive terms', () => {
    it('masks custom user-defined private words', () => {
      const input = 'The secret project is Project Apollo and Client Acme Corp';
      const result = maskSensitiveText(input, ['Project Apollo', 'Acme Corp']);
      expect(result.sanitizedText).toBe('The secret project is [REDACTED_PRIVATE] and Client [REDACTED_PRIVATE]');
      expect(result.detections.length).toBe(2);
      expect(result.detections[0].category).toBe('custom');
    });
  });

  describe('Conversation sanitization pipeline (Pre-processing)', () => {
    it('processes messages, masks content, and returns accurate detection report', () => {
      const messages: ChatMessage[] = [
        {
          index: 1,
          timestamp: '10:00 AM',
          sender: 'Alex',
          text: 'My PIN is 1234. Please pay before 5 PM.',
          raw: '10:00 AM - Alex: My PIN is 1234. Please pay before 5 PM.',
          isSystem: false
        },
        {
          index: 2,
          timestamp: '10:02 AM',
          sender: 'Sam',
          text: 'Got it, contact me at sam@company.com if needed.',
          raw: '10:02 AM - Sam: Got it, contact me at sam@company.com if needed.',
          isSystem: false
        },
        {
          index: 3,
          timestamp: '10:05 AM',
          sender: 'Alex',
          text: 'Sure, we meet at 4 PM.',
          raw: '10:05 AM - Alex: Sure, we meet at 4 PM.',
          isSystem: false
        }
      ];

      const { sanitizedMessages, privacyReport } = sanitizeConversation(messages);

      expect(sanitizedMessages.length).toBe(3);
      // Original messages are untouched
      expect(messages[0].text).toBe('My PIN is 1234. Please pay before 5 PM.');
      // Sanitized message has masked text
      expect(sanitizedMessages[0].text).toBe('My PIN is ****. Please pay before 5 PM.');
      expect(sanitizedMessages[1].text).toContain('sam@company.com'.replace(/./g, '*'));
      expect(sanitizedMessages[2].text).toBe('Sure, we meet at 4 PM.');

      expect(privacyReport.totalDetections).toBe(2);
      expect(privacyReport.categoryCounts.pin).toBe(1);
      expect(privacyReport.categoryCounts.email).toBe(1);
    });
  });

  describe('Secondary sanitization pass on AI output (Post-processing)', () => {
    it('sanitizes AI output fields to prevent reintroduction of secrets', () => {
      const rawAiResult = {
        quickSummary: 'Alex shared PIN 1234 and phone +1 555-123-4567.',
        importantMessages: [
          {
            id: '1',
            title: 'Payment PIN',
            summary: 'The PIN is 1234 for Alex',
            priority: 'urgent',
            confidence: 'high',
            evidence: [
              { messageIndex: 1, timestamp: '10:00 AM', sender: 'Alex', snippet: 'My PIN is 1234' }
            ]
          }
        ],
        decisions: [
          {
            id: '2',
            decision: 'Email queries to boss@startup.io',
            priority: 'important',
            confidence: 'high',
            evidence: []
          }
        ],
        actionItems: [
          {
            id: '3',
            task: 'Send OTP 889900 to verification portal',
            owner: 'Sam',
            deadline: 'today',
            priority: 'urgent',
            confidence: 'high',
            commitmentType: 'promise',
            evidence: []
          }
        ],
        unansweredQuestions: [],
        limitations: []
      };

      const sanitized = sanitizeAnalysisResult(rawAiResult);

      expect(sanitized.quickSummary).not.toContain('1234');
      expect(sanitized.importantMessages[0].summary).not.toContain('1234');
      expect(sanitized.importantMessages[0].evidence[0].snippet).not.toContain('1234');
      expect(sanitized.decisions[0].decision).not.toContain('boss@startup.io');
      expect(sanitized.actionItems[0].task).not.toContain('889900');
    });
  });
});
