import { describe, expect, it } from 'vitest';
import { buildExtractiveAnalysis } from './extractiveAnalysis';
import type { ChatMessage } from '../types';

function message(index: number, sender: string, text: string): ChatMessage {
  return {
    index,
    timestamp: `1/1/24 10:0${index} AM`,
    sender,
    text,
    isSystem: false,
    raw: text
  };
}

describe('extractive analysis fallback', () => {
  it('builds a valid conservative report from messages when model JSON fails', () => {
    const result = buildExtractiveAnalysis(
      [
        message(0, 'Asha', 'Can you send the deck by tomorrow?'),
        message(1, 'Dev', 'Confirmed, we will meet today at 5 pm.'),
        message(2, 'Asha', 'What should we tell the client?')
      ],
      'The model did not return JSON.'
    );

    expect(result.quickSummary).toContain('Analyzed 3 messages');
    expect(result.actionItems[0]).toMatchObject({
      task: 'Can you send the deck by tomorrow?',
      deadline: 'by tomorrow',
      priority: 'urgent'
    });
    expect(result.decisions[0].decision).toBe('Confirmed, we will meet today at 5 pm.');
    expect(result.unansweredQuestions.map((item) => item.question)).toContain('What should we tell the client?');
    expect(result.limitations.join(' ')).toContain('keyword-based local fallback');
    expect(result.actionItems[0].evidence[0]).toMatchObject({
      messageIndex: 0,
      sender: 'Asha'
    });
  });
});
