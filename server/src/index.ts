import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { analyzeRouter } from './routes/analyze.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST']
  })
);
app.use(express.json({ limit: '4mb' }));

app.use('/api/health', healthRouter);
app.use('/api/analyze', analyzeRouter);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`CatchUp AI backend listening on http://127.0.0.1:${config.PORT}`);
});
