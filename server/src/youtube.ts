import fs from 'node:fs';
import { google } from 'googleapis';
import {
  getAppSettings,
  getChannelById,
  getChannelTokens,
  setChannelStatus,
  updateChannelTokens,
  upsertYouTubeChannel,
  type ChannelRecord,
  type JobRecord,
  type PlaylistSummary,
} from './db.js';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getRedirectUri(publicBaseUrl?: string): string {
  const base = (publicBaseUrl || getAppSettings().publicBaseUrl).replace(/\/+$/, '');
  return `${base}/api/auth/google/callback`;
}

export function createOAuthClient() {
  const settings = getAppSettings();
  if (!settings.googleClientId || !settings.googleClientSecret) {
    throw new Error('Google Client ID та Client Secret ще не налаштовані. Заповніть їх у розділі "Налаштування".');
  }
  return new google.auth.OAuth2(
    settings.googleClientId,
    settings.googleClientSecret,
    getRedirectUri(settings.publicBaseUrl)
  );
}

export function buildGoogleOAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: true,
    scope: YOUTUBE_SCOPES,
    state,
  });
}

async function fetchChannelPlaylists(youtube: ReturnType<typeof google.youtube>): Promise<PlaylistSummary[]> {
  try {
    const res = await youtube.playlists.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
      maxResults: 50,
    });
    return (res.data.items || [])
      .filter((item) => Boolean(item.id))
      .map((item) => ({
        id: String(item.id),
        title: String(item.snippet?.title || 'Без назви'),
        itemCount: Number(item.contentDetails?.itemCount ?? 0),
      }));
  } catch {
    return [];
  }
}

export async function exchangeCodeAndSaveChannel(code: string): Promise<ChannelRecord> {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const channelRes = await youtube.channels.list({
    part: ['snippet', 'statistics'],
    mine: true,
  });

  const channelItem = channelRes.data.items?.[0];
  if (!channelItem || !channelItem.id) {
    throw new Error(
      'У цьому Google-акаунті не знайдено YouTube-каналу. Створіть канал на YouTube або оберіть Brand-акаунт під час входу.'
    );
  }

  let googleEmail = '';
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    googleEmail = userInfo.data.email || '';
  } catch {
    googleEmail = '';
  }

  const playlists = await fetchChannelPlaylists(youtube);

  return upsertYouTubeChannel({
    youtubeChannelId: channelItem.id,
    title: channelItem.snippet?.title || 'YouTube Channel',
    handle: channelItem.snippet?.customUrl || '',
    avatarUrl:
      channelItem.snippet?.thumbnails?.medium?.url ||
      channelItem.snippet?.thumbnails?.default?.url ||
      '',
    googleEmail,
    subscriberCount: Number(channelItem.statistics?.subscriberCount ?? 0),
    videoCount: Number(channelItem.statistics?.videoCount ?? 0),
    accessToken: tokens.access_token || '',
    refreshToken: tokens.refresh_token || '',
    tokenExpiry: Number(tokens.expiry_date || Date.now() + 3500 * 1000),
    playlists,
    isDemo: false,
  });
}

export async function getAuthorizedClientForChannel(channelId: number) {
  const channel = getChannelById(channelId);
  if (!channel) throw new Error('Канал не знайдено');
  if (channel.isDemo) throw new Error('Демо-канал не використовує реальний OAuth');

  const tokens = getChannelTokens(channelId);
  if (!tokens?.refreshToken && !tokens?.accessToken) {
    setChannelStatus(channelId, 'error', 'Відсутній refresh token. Перепідключіть канал.');
    throw new Error('Відсутній refresh token. Перепідключіть канал.');
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.tokenExpiry || undefined,
  });

  oauth2Client.on('tokens', (newTokens) => {
    if (newTokens.access_token) {
      updateChannelTokens(
        channelId,
        newTokens.access_token,
        Number(newTokens.expiry_date || Date.now() + 3500 * 1000),
        newTokens.refresh_token || undefined
      );
    }
  });

  // Proactively ensure valid token
  try {
    await oauth2Client.getAccessToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setChannelStatus(channelId, 'error', `Помилка токена: ${msg}`);
    throw new Error(`Помилка оновлення OAuth-токена (можливо, відкликано доступ або минув 7-денний термін Testing): ${msg}`);
  }

  return oauth2Client;
}

export async function refreshChannelMetadata(channelId: number): Promise<ChannelRecord> {
  const existing = getChannelById(channelId);
  if (!existing) throw new Error('Канал не знайдено');
  if (existing.isDemo) return existing;

  const auth = await getAuthorizedClientForChannel(channelId);
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.channels.list({
    part: ['snippet', 'statistics'],
    mine: true,
  });
  const item = res.data.items?.[0];
  if (!item?.id) {
    throw new Error('Не вдалося отримати дані каналу з YouTube');
  }
  const playlists = await fetchChannelPlaylists(youtube);
  const tokens = getChannelTokens(channelId);

  return upsertYouTubeChannel({
    youtubeChannelId: item.id,
    title: item.snippet?.title || existing.title,
    handle: item.snippet?.customUrl || existing.handle,
    avatarUrl:
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      existing.avatarUrl,
    googleEmail: existing.googleEmail,
    subscriberCount: Number(item.statistics?.subscriberCount ?? existing.subscriberCount),
    videoCount: Number(item.statistics?.videoCount ?? existing.videoCount),
    accessToken: tokens?.accessToken || '',
    refreshToken: tokens?.refreshToken || '',
    tokenExpiry: tokens?.tokenExpiry || 0,
    playlists,
    isDemo: false,
  });
}

export async function revokeChannelToken(channelId: number): Promise<void> {
  const tokens = getChannelTokens(channelId);
  if (!tokens?.refreshToken && !tokens?.accessToken) return;
  try {
    const oauth2Client = createOAuthClient();
    await oauth2Client.revokeToken(tokens.refreshToken || tokens.accessToken);
  } catch {
    // Ignore revoke errors if token already expired/revoked
  }
}

export interface YouTubeInsertPayload {
  part: string[];
  notifySubscribers: boolean;
  requestBody: {
    snippet: {
      title: string;
      description: string;
      tags?: string[];
      categoryId: string;
      defaultLanguage?: string;
      defaultAudioLanguage?: string;
    };
    status: {
      privacyStatus: 'public' | 'unlisted' | 'private';
      publishAt?: string;
      selfDeclaredMadeForKids: boolean;
      containsSyntheticMedia: boolean;
      embeddable: boolean;
      publicStatsViewable: boolean;
      license: 'youtube' | 'creativeCommon';
    };
    paidProductPlacementDetails: {
      hasPaidProductPlacement: boolean;
    };
  };
}

export function buildYouTubeInsertPayload(job: {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  defaultLanguage: string;
  defaultAudioLanguage: string;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  hasPaidProductPlacement: boolean;
  notifySubscribers: boolean;
  embeddable: boolean;
  publicStatsViewable: boolean;
  license: 'youtube' | 'creativeCommon';
  privacyStatus: 'public' | 'unlisted' | 'private';
  publishMode: string;
  scheduledFor: string | null;
  waitForProcessing: boolean;
}): YouTubeInsertPayload {
  const cleanTags = job.tags.map((t) => t.trim()).filter(Boolean);

  let initialPrivacy: 'public' | 'unlisted' | 'private' = job.privacyStatus;
  let publishAt: string | undefined;

  if (job.publishMode === 'youtube_schedule' && job.scheduledFor) {
    initialPrivacy = 'private';
    const schedMs = new Date(job.scheduledFor).getTime();
    // YouTube requires publishAt to be in the future if scheduled; if already passed, publish immediately instead
    if (Number.isFinite(schedMs) && schedMs > Date.now() + 60 * 1000) {
      publishAt = new Date(schedMs).toISOString();
    } else {
      initialPrivacy = job.privacyStatus === 'private' ? 'public' : job.privacyStatus;
    }
  } else if (job.publishMode === 'draft_private') {
    initialPrivacy = 'private';
  } else if (job.waitForProcessing && job.privacyStatus !== 'private') {
    // Upload as private while YouTube finishes HD processing + Content ID check, then switch to target privacy
    initialPrivacy = 'private';
  }

  return {
    part: ['snippet', 'status', 'paidProductPlacementDetails'],
    notifySubscribers: job.notifySubscribers,
    requestBody: {
      snippet: {
        title: job.title.trim().slice(0, 100),
        description: job.description.slice(0, 5000),
        ...(cleanTags.length > 0 ? { tags: cleanTags } : {}),
        categoryId: job.categoryId || '22',
        ...(job.defaultLanguage ? { defaultLanguage: job.defaultLanguage } : {}),
        ...(job.defaultAudioLanguage ? { defaultAudioLanguage: job.defaultAudioLanguage } : {}),
      },
      status: {
        privacyStatus: initialPrivacy,
        ...(publishAt ? { publishAt } : {}),
        selfDeclaredMadeForKids: Boolean(job.madeForKids),
        containsSyntheticMedia: Boolean(job.containsSyntheticMedia),
        embeddable: Boolean(job.embeddable),
        publicStatsViewable: Boolean(job.publicStatsViewable),
        license: job.license === 'creativeCommon' ? 'creativeCommon' : 'youtube',
      },
      paidProductPlacementDetails: {
        hasPaidProductPlacement: Boolean(job.hasPaidProductPlacement),
      },
    },
  };
}

export async function uploadVideoToYouTube(
  job: JobRecord,
  videoPath: string,
  thumbnailPath: string | null,
  onProgress: (percent: number) => void,
  onLog: (level: 'info' | 'warn' | 'error', msg: string) => void
): Promise<{ videoId: string; url: string; payload: YouTubeInsertPayload }> {
  const auth = await getAuthorizedClientForChannel(job.channelId);
  const youtube = google.youtube({ version: 'v3', auth });

  const payload = buildYouTubeInsertPayload(job);
  const totalBytes = fs.statSync(videoPath).size;

  onLog('info', `Початок завантаження файлу (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) через videos.insert...`);

  const insertParams: Record<string, unknown> = {
    part: payload.part,
    notifySubscribers: payload.notifySubscribers,
    requestBody: payload.requestBody,
    media: {
      mimeType: job.videoMimeType || 'video/mp4',
      body: fs.createReadStream(videoPath),
    },
  };

  let lastReported = 0;
  const insertRes = await youtube.videos.insert(insertParams as never, {
    onUploadProgress: (evt: { bytesRead?: number }) => {
      const bytesRead = Number(evt?.bytesRead ?? 0);
      if (totalBytes > 0) {
        const pct = Math.min(92, Math.max(1, Math.round((bytesRead / totalBytes) * 92)));
        if (pct >= lastReported + 3 || pct === 92) {
          lastReported = pct;
          onProgress(pct);
        }
      }
    },
  });

  const videoId = insertRes.data.id;
  if (!videoId) {
    throw new Error('YouTube API не повернув ID створеного відео');
  }

  onLog('info', `Відео завантажено на YouTube! Video ID: ${videoId}`);
  onProgress(94);

  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    try {
      onLog('info', 'Завантаження кастомного прев’ю (thumbnails.set)...');
      await youtube.thumbnails.set({
        videoId,
        media: {
          body: fs.createReadStream(thumbnailPath),
        },
      });
      onLog('info', 'Прев’ю успішно встановлено.');
    } catch (thumbErr) {
      const msg = thumbErr instanceof Error ? thumbErr.message : String(thumbErr);
      onLog(
        'warn',
        `Не вдалося встановити прев’ю (перевірте, чи підтверджено номер телефону на каналі в YouTube Studio): ${msg}`
      );
    }
  }

  if (job.playlistId) {
    try {
      onLog('info', `Додавання відео у плейлист ${job.playlistId}...`);
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId: job.playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        },
      });
      onLog('info', 'Відео додано в плейлист.');
    } catch (plErr) {
      const msg = plErr instanceof Error ? plErr.message : String(plErr);
      onLog('warn', `Помилка додавання в плейлист: ${msg}`);
    }
  }

  // If immediate/server_schedule with waitForProcessing enabled and target privacy != private,
  // poll processingDetails briefly (up to 6 mins) before flipping to target privacy
  const needsFlipAfterProcessing =
    job.publishMode !== 'youtube_schedule' &&
    job.publishMode !== 'draft_private' &&
    job.waitForProcessing &&
    job.privacyStatus !== 'private';

  if (needsFlipAfterProcessing) {
    onLog('info', 'Очікування завершення обробки YouTube перед відкриттям публічного доступу...');
    const maxAttempts = 24; // 24 * 15s = 6 min
    let ready = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 15000));
      try {
        const check = await youtube.videos.list({
          part: ['processingDetails', 'status'],
          id: [videoId],
        });
        const proc = check.data.items?.[0]?.processingDetails?.processingStatus;
        onLog('info', `Перевірка обробки (${attempt}/${maxAttempts}): статус = ${proc || 'unknown'}`);
        if (proc === 'succeeded' || proc === 'failed' || proc === 'terminated') {
          ready = true;
          break;
        }
      } catch {
        // continue polling
      }
    }

    try {
      await youtube.videos.update({
        part: ['status'],
        requestBody: {
          id: videoId,
          status: {
            privacyStatus: job.privacyStatus,
          },
        },
      });
      onLog(
        'info',
        ready
          ? `Обробку завершено! Доступ змінено на "${job.privacyStatus}".`
          : `Таймаут очікування обробки — доступ змінено на "${job.privacyStatus}".`
      );
    } catch (updErr) {
      const msg = updErr instanceof Error ? updErr.message : String(updErr);
      onLog('warn', `Відео залите як private, але не вдалося змінити доступ на ${job.privacyStatus}: ${msg}`);
    }
  }

  onProgress(100);
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    payload,
  };
}
