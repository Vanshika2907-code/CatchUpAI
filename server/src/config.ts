import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:5173'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  ENABLE_SERVER_LOCAL_AI: z
    .string()
    .default('false')
    .transform((value) => value === 'true')
});

export const config = configSchema.parse(process.env);
