import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { requireAdminAuth } from './middleware/adminAuth.js';
import { authRouter } from './routes/auth.js';
import { channelsRouter } from './routes/channels.js';
import { jobsRouter } from './routes/jobs.js';
import { presetsRouter } from './routes/presets.js';
import { settingsRouter } from './routes/settings.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'yt-autopost', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);

  app.use('/api/settings', requireAdminAuth, settingsRouter);
  app.use('/api/channels', requireAdminAuth, channelsRouter);
  app.use('/api/presets', requireAdminAuth, presetsRouter);
  app.use('/api/jobs', requireAdminAuth, jobsRouter);

  app.get('/api/media/thumbnail/:filename', requireAdminAuth, (req, res) => {
    const safeName = path.basename(String(req.params.filename || ''));
    const filePath = path.join(config.thumbnailsDir, safeName);
    if (!safeName || !fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    res.sendFile(filePath);
  });

  app.get('/api/media/video/:filename', requireAdminAuth, (req, res) => {
    const safeName = path.basename(String(req.params.filename || ''));
    const filePath = path.join(config.uploadsDir, safeName);
    if (!safeName || !fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    res.sendFile(filePath);
  });

  app.get('/api/media/local-file', requireAdminAuth, (req, res) => {
    if (!config.isDesktop) {
      res.status(403).end();
      return;
    }
    const rawPath = String(req.query.path || '').trim();
    if (!rawPath) {
      res.status(400).end();
      return;
    }
    const resolved = path.resolve(rawPath);
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      res.status(404).end();
      return;
    }
    res.sendFile(resolved);
  });

  if (fs.existsSync(config.clientDistDir)) {
    app.use(express.static(config.clientDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(config.clientDistDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Внутрішня помилка сервера';
    res.status(500).json({ error: message });
  });

  return app;
}
