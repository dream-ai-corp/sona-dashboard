import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { errorHandler } from './core/middleware/error-handler.middleware';
import { registerModules } from './module-registry';

export async function createApp() {
  const app = express();

  // Global middleware
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (config.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Register all feature modules
  await registerModules(app);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
