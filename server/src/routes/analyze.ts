import { Router } from 'express';
import { analyzeRequestSchema } from '../schemas.js';
import { analyzeWithGemini } from '../gemini.js';
import { maskSensitiveTextServer, sanitizeAnalysisResultServer } from '../privacyShield.js';

export const analyzeRouter = Router();

analyzeRouter.post('/', async (request, response) => {
  const body = analyzeRequestSchema.parse(request.body);

  if (body.mode === 'server-gemini') {
    if (!body.transcript) {
      response.status(400).json({ ok: false, error: 'Transcript is required for Gemini analysis.' });
      return;
    }

    const sanitizedTranscript = maskSensitiveTextServer(body.transcript);
    const rawResult = await analyzeWithGemini(sanitizedTranscript);
    const result = sanitizeAnalysisResultServer(rawResult);

    response.json({
      ok: true,
      mode: body.mode,
      result
    });
    return;
  }

  response.status(202).json({
    ok: true,
    mode: body.mode,
    accepted: true,
    message:
      'Local Privacy Mode keeps chat content in the browser. The backend validates app connectivity and metadata only; private transcript analysis runs in the frontend worker.'
  });
});
