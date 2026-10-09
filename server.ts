import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './server/src/config.js';
import { errorHandler } from './server/src/middleware/errorHandler.js';
import { healthRouter } from './server/src/routes/health.js';
import { analyzeRouter } from './server/src/routes/analyze.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );

  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS']
    })
  );

  app.use(express.json({ limit: '10mb' }));

  // API routes
  app.use('/api/health', healthRouter);
  app.use('/api/analyze', analyzeRouter);

  // Error handling middleware
  app.use(errorHandler);

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || config.PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`CatchUp AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Fatal server startup error:', error);
  process.exit(1);
});
