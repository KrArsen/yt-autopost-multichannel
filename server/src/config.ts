import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_DIR = path.resolve(process.cwd());
const IS_DESKTOP = process.env.YT_AUTOPOST_DESKTOP === '1';
const DATA_DIR = process.env.YT_AUTOPOST_DATA_DIR
  ? path.resolve(process.env.YT_AUTOPOST_DATA_DIR)
  : path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
const DB_PATH = path.join(DATA_DIR, 'autopost.db');
const SECRET_KEY_FILE = path.join(DATA_DIR, '.secret.key');
const CLIENT_DIST_DIR = process.env.YT_AUTOPOST_CLIENT_DIST
  ? path.resolve(process.env.YT_AUTOPOST_CLIENT_DIST)
  : path.join(ROOT_DIR, 'dist');

function ensureDirectories(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
}

function loadEncryptionSecret(): string {
  const fromEnv = process.env.APP_ENCRYPTION_KEY?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    return fromEnv;
  }

  ensureDirectories();
  if (fs.existsSync(SECRET_KEY_FILE)) {
    const existing = fs.readFileSync(SECRET_KEY_FILE, 'utf8').trim();
    if (existing.length >= 32) {
      return existing;
    }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_KEY_FILE, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

ensureDirectories();

const defaultPort = Number(process.env.PORT || 3456);
const defaultHostBase = IS_DESKTOP ? `http://127.0.0.1:${defaultPort}` : `http://localhost:${defaultPort}`;

export const config = {
  isDesktop: IS_DESKTOP,
  rootDir: ROOT_DIR,
  dataDir: DATA_DIR,
  uploadsDir: UPLOADS_DIR,
  thumbnailsDir: THUMBNAILS_DIR,
  dbPath: DB_PATH,
  clientDistDir: CLIENT_DIST_DIR,
  port: defaultPort,
  actualPort: defaultPort,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || defaultHostBase).replace(/\/+$/, ''),
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  envGoogleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
  envGoogleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
  adminPassword: process.env.ADMIN_PASSWORD?.trim() || '',
  encryptionSecret: loadEncryptionSecret(),
  onOAuthCompleted: null as null | ((payload: { ok: boolean; channelTitle?: string; error?: string }) => void),
};

export function setRuntimePort(port: number): void {
  config.actualPort = port;
  if (config.isDesktop && !process.env.PUBLIC_BASE_URL) {
    config.publicBaseUrl = `http://127.0.0.1:${port}`;
  }
}
