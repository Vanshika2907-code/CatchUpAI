import { z } from 'zod';

export const analyzeRequestSchema = z.object({
  mode: z.enum(['local-browser', 'server-gemini']).default('local-browser'),
  messageCount: z.number().int().nonnegative(),
  textLength: z.number().int().nonnegative(),
  transcript: z.string().max(2_800_000).optional()
});
