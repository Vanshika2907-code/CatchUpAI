import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      ok: false,
      error: 'Request validation failed.',
      issues: error.issues
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  response.status(500).json({ ok: false, error: message });
};
