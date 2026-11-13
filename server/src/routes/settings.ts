import { Router } from 'express';
import { config } from '../config.js';
import { maskSecret } from '../crypto.js';
import { getAppSettings, getTodayQuotaSummary, updateAppSettings } from '../db.js';
import { getRedirectUri, YOUTUBE_SCOPES } from '../youtube.js';

export const settingsRouter = Router();

function buildSettingsPayload() {
  const settings = getAppSettings();
  const quota = getTodayQuotaSummary();
  return {
    googleClientId: settings.googleClientId,
    hasGoogleClientSecret: Boolean(settings.googleClientSecret),
    googleClientSecretMasked: maskSecret(settings.googleClientSecret),
    publicBaseUrl: settings.publicBaseUrl,
    redirectUri: getRedirectUri(settings.publicBaseUrl),
    timezone: settings.timezone,
    preUploadLeadMinutes: settings.preUploadLeadMinutes,
    oauthConfigured: Boolean(settings.googleClientId && settings.googleClientSecret),
    scopes: YOUTUBE_SCOPES,
    isDesktop: config.isDesktop,
    dataDir: config.dataDir,
    actualPort: config.actualPort,
    quota,
  };
}

settingsRouter.get('/', (_req, res) => {
  res.json(buildSettingsPayload());
});

settingsRouter.put('/', (req, res) => {
  const {
    googleClientId,
    googleClientSecret,
    publicBaseUrl,
    timezone,
    preUploadLeadMinutes,
  } = req.body || {};

  updateAppSettings({
    googleClientId: typeof googleClientId === 'string' ? googleClientId : undefined,
    googleClientSecret: typeof googleClientSecret === 'string' ? googleClientSecret : undefined,
    publicBaseUrl: typeof publicBaseUrl === 'string' ? publicBaseUrl : undefined,
    timezone: typeof timezone === 'string' ? timezone : undefined,
    preUploadLeadMinutes:
      preUploadLeadMinutes !== undefined ? Number(preUploadLeadMinutes) : undefined,
  });

  res.json(buildSettingsPayload());
});
