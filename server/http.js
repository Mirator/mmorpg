import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAdminStateHandler } from './admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../client');
const ADMIN_DIR = path.resolve(__dirname, '../admin');
const SHARED_DIR = path.resolve(__dirname, '../shared');

export function createHttpApp({ config, world, players, resources, mobs }) {
  const app = express();
  app.disable('x-powered-by');

  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(ADMIN_DIR, 'index.html'));
  });
  app.use('/admin', express.static(ADMIN_DIR));
  app.use('/shared', express.static(SHARED_DIR));
  app.use(express.static(CLIENT_DIR));

  app.get(
    '/admin/state',
    createAdminStateHandler({
      password: config.adminPassword,
      world,
      players,
      resources,
      mobs,
    })
  );

  return app;
}
