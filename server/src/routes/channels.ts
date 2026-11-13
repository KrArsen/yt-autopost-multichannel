import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import {
  createOAuthState,
  db,
  deleteChannel,
  getAppSettings,
  getChannelById,
  listChannels,
  updateChannelSettings,
  upsertYouTubeChannel,
} from '../db.js';
import { computeNextScheduleSlot } from '../scheduler.js';
import { buildGoogleOAuthUrl, refreshChannelMetadata, revokeChannelToken } from '../youtube.js';

export const channelsRouter = Router();

channelsRouter.get('/', (_req, res) => {
  res.json({ channels: listChannels() });
});

channelsRouter.post('/oauth-url', (req, res) => {
  try {
    const rawMode = String(req.body?.mode || 'redirect');
    const mode = rawMode === 'copy' || rawMode === 'desktop' ? rawMode : 'redirect';
    const rawOrigin = String(req.body?.returnOrigin || req.headers.origin || config.frontendUrl || config.publicBaseUrl);
    const returnOrigin = rawOrigin.replace(/\/+$/, '');
    const state = crypto.randomBytes(24).toString('hex');
    createOAuthState(state, returnOrigin, mode);
    const url = buildGoogleOAuthUrl(state);
    res.json({ url, state });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

channelsRouter.post('/demo', (req, res) => {
  const count = listChannels().filter((c) => c.isDemo).length + 1;
  const title = String(req.body?.title || `Тестовий канал #${count} (Sandbox)`).trim();
  const handle = String(req.body?.handle || `@demo_channel_${count}`).trim();
  const channel = upsertYouTubeChannel({
    youtubeChannelId: `UC_DEMO_${Date.now()}_${count}`,
    title,
    handle,
    avatarUrl: '',
    googleEmail: `sandbox${count}@local`,
    subscriberCount: Math.floor(500 + Math.random() * 9000),
    videoCount: Math.floor(5 + Math.random() * 40),
    accessToken: '',
    refreshToken: '',
    tokenExpiry: 0,
    playlists: [
      { id: `PL_DEMO_${count}_1`, title: 'Основні відео', itemCount: 8 },
      { id: `PL_DEMO_${count}_2`, title: 'Shorts', itemCount: 15 },
    ],
    isDemo: true,
  });
  res.status(201).json({ channel });
});

channelsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Некоректний ID каналу' });
    return;
  }

  const { isActive, defaultPresetId, scheduleSlots } = req.body || {};
  const updated = updateChannelSettings(id, {
    isActive: typeof isActive === 'boolean' ? isActive : undefined,
    defaultPresetId:
      defaultPresetId === null
        ? null
        : defaultPresetId !== undefined
          ? Number(defaultPresetId)
          : undefined,
    scheduleSlots:
      scheduleSlots && typeof scheduleSlots === 'object'
        ? {
            days: Array.isArray(scheduleSlots.days)
              ? scheduleSlots.days.map(Number).filter((d: number) => d >= 0 && d <= 6)
              : [1, 2, 3, 4, 5, 6, 0],
            times: Array.isArray(scheduleSlots.times)
              ? scheduleSlots.times.map(String).filter((t: string) => /^\d{2}:\d{2}$/.test(t))
              : ['18:00'],
          }
        : undefined,
  });

  if (!updated) {
    res.status(404).json({ error: 'Канал не знайдено' });
    return;
  }
  res.json({ channel: updated });
});

channelsRouter.post('/:id/refresh', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const channel = await refreshChannelMetadata(id);
    res.json({ channel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

channelsRouter.get('/:id/next-slot', (req, res) => {
  const id = Number(req.params.id);
  const channel = getChannelById(id);
  if (!channel) {
    res.status(404).json({ error: 'Канал не знайдено' });
    return;
  }
  const settings = getAppSettings();
  const rows = db
    .prepare(
      `SELECT scheduled_for FROM jobs
       WHERE channel_id = ? AND scheduled_for IS NOT NULL AND status NOT IN ('cancelled', 'failed')`
    )
    .all(id) as { scheduled_for: string }[];
  const occupied = rows.map((r) => r.scheduled_for);
  const nextSlotIso = computeNextScheduleSlot(channel.scheduleSlots, settings.timezone, occupied);
  res.json({ nextSlotIso, timezone: settings.timezone });
});

channelsRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const channel = getChannelById(id);
  if (!channel) {
    res.status(404).json({ error: 'Канал не знайдено' });
    return;
  }
  if (!channel.isDemo && req.query.revoke === '1') {
    await revokeChannelToken(id);
  }
  deleteChannel(id);
  res.json({ ok: true });
});
