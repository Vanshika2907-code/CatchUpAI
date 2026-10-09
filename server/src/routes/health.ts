import { Router } from 'express';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  response.json({
    ok: true,
    service: 'catchup-ai-backend',
    mode: config.GEMINI_API_KEY ? 'server-gemini' : 'local-browser-ai',
    geminiConfigured: Boolean(config.GEMINI_API_KEY),
    geminiModel: config.GEMINI_MODEL,
    serverLocalAiEnabled: config.ENABLE_SERVER_LOCAL_AI,
    timestamp: new Date().toISOString()
  });
});
