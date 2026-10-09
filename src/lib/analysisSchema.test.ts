import { describe, expect, it } from 'vitest';
import { extractJson, parseModelJson } from './analysisSchema';

describe('analysis schema', () => {
  it('extracts fenced JSON and validates the report shape', () => {
    const result = parseModelJson(`\`\`\`json
{
  "quickSummary": "A deadline was discussed.",
  "importantMessages": [],
  "decisions": [],
  "actionItems": [{
    "id": "a1",
    "task": "Send the deck",
    "owner": "Bob",
    "deadline": "5 PM",
    "priority": "urgent",
    "confidence": "high",
    "commitmentType": "explicit",
    "evidence": [{"messageIndex": 1, "timestamp": "1/1/24 10:00 AM", "sender": "Bob", "snippet": "send the deck"}]
  }],
  "unansweredQuestions": [],
  "limitations": []
}
\`\`\``);

    expect(result.actionItems[0].task).toBe('Send the deck');
  });

  it('rejects non-json output', () => {
    expect(() => extractJson('Here is a summary with no object.')).toThrow('JSON');
  });
});
