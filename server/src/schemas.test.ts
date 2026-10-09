import { describe, expect, it } from 'vitest';
import { analyzeRequestSchema } from './schemas';

describe('analyzeRequestSchema', () => {
  it('accepts metadata without transcript content', () => {
    const parsed = analyzeRequestSchema.parse({
      mode: 'local-browser',
      messageCount: 12,
      textLength: 500
    });

    expect(parsed.messageCount).toBe(12);
  });

  it('rejects unexpected modes', () => {
    expect(() =>
      analyzeRequestSchema.parse({
        mode: 'cloud',
        messageCount: 12,
        textLength: 500
      })
    ).toThrow();
  });
});
