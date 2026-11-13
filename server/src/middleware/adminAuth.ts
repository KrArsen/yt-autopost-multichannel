import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { sha256 } from '../crypto.js';

const COOKIE_NAME = 'ytap_session';

function getExpectedToken(): string {
  if (!config.adminPassword) return '';
  return sha256(`${config.adminPassword}:${config.encryptionSecret}`);
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function isRequestAuthenticated(req: Request): boolean {
  if (!config.adminPassword) return true;
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME] || '';
  const expected = getExpectedToken();
  if (!token || !expected || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function setAdminSessionCookie(res: Response): void {
  const token = getExpectedToken();
  if (!token) return;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAdminSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (isRequestAuthenticated(req)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Потрібна авторизація адміністратора' });
}
