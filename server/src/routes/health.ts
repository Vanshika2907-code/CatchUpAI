import { Router } from 'express';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY || config.GEMINI_API_KEY);
  response.json({
    ok: true,
    service: 'catchup-ai-backend',
    mode: geminiConfigured ? 'server-gemini' : 'local-browser-ai',
    geminiConfigured,
    geminiModel: config.GEMINI_MODEL,
    serverLocalAiEnabled: config.ENABLE_SERVER_LOCAL_AI,
    timestamp: new Date().toISOString()
  });
});
