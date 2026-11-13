import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { decryptSecret, encryptSecret } from './crypto.js';

export type PublishMode = 'now' | 'youtube_schedule' | 'server_schedule' | 'draft_private';
export type JobStatus =
  | 'scheduled'
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'published'
  | 'failed'
  | 'cancelled';

export interface PresetRecord {
  id: number;
  name: string;
  descriptionFooter: string;
  defaultTags: string[];
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
  defaultPrivacy: 'public' | 'unlisted' | 'private';
  waitForProcessing: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleSlots {
  days: number[];
  times: string[];
}

export interface PlaylistSummary {
  id: string;
  title: string;
  itemCount: number;
}

export interface ChannelRecord {
  id: number;
  youtubeChannelId: string;
  title: string;
  handle: string;
  avatarUrl: string;
  googleEmail: string;
  subscriberCount: number;
  videoCount: number;
  isDemo: boolean;
  isActive: boolean;
  status: 'connected' | 'error' | 'sandbox';
  lastError: string;
  defaultPresetId: number | null;
  scheduleSlots: ScheduleSlots;
  playlists: PlaylistSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface JobLogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface JobRecord {
  id: number;
  channelId: number;
  channelTitle?: string;
  channelHandle?: string;
  channelAvatarUrl?: string;
  channelIsDemo?: boolean;
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
  publishMode: PublishMode;
  scheduledFor: string | null;
  waitForProcessing: boolean;
  playlistId: string;
  videoFilename: string;
  videoExternalPath: string;
  videoOriginalName: string;
  videoSizeBytes: number;
  videoMimeType: string;
  thumbnailFilename: string;
  thumbnailOriginalName: string;
  status: JobStatus;
  progress: number;
  youtubeVideoId: string;
  youtubeUrl: string;
  apiPayload: Record<string, unknown>;
  logs: JobLogEntry[];
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AppSettings {
  googleClientId: string;
  googleClientSecret: string;
  publicBaseUrl: string;
  timezone: string;
  preUploadLeadMinutes: number;
  adminPasswordHash: string;
}

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    return_origin TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'redirect',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description_footer TEXT NOT NULL DEFAULT '',
    default_tags_json TEXT NOT NULL DEFAULT '[]',
    category_id TEXT NOT NULL DEFAULT '22',
    default_language TEXT NOT NULL DEFAULT 'uk',
    default_audio_language TEXT NOT NULL DEFAULT 'uk',
    made_for_kids INTEGER NOT NULL DEFAULT 0,
    contains_synthetic_media INTEGER NOT NULL DEFAULT 0,
    has_paid_product_placement INTEGER NOT NULL DEFAULT 0,
    notify_subscribers INTEGER NOT NULL DEFAULT 1,
    embeddable INTEGER NOT NULL DEFAULT 1,
    public_stats_viewable INTEGER NOT NULL DEFAULT 1,
    license TEXT NOT NULL DEFAULT 'youtube',
    default_privacy TEXT NOT NULL DEFAULT 'public',
    wait_for_processing INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_channel_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    handle TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    google_email TEXT NOT NULL DEFAULT '',
    subscriber_count INTEGER NOT NULL DEFAULT 0,
    video_count INTEGER NOT NULL DEFAULT 0,
    access_token_enc TEXT NOT NULL DEFAULT '',
    refresh_token_enc TEXT NOT NULL DEFAULT '',
    token_expiry INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'connected',
    last_error TEXT NOT NULL DEFAULT '',
    default_preset_id INTEGER REFERENCES presets(id) ON DELETE SET NULL,
    schedule_slots_json TEXT NOT NULL DEFAULT '{"days":[1,2,3,4,5,6,0],"times":["12:00","18:00"]}',
    playlists_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    category_id TEXT NOT NULL DEFAULT '22',
    default_language TEXT NOT NULL DEFAULT 'uk',
    default_audio_language TEXT NOT NULL DEFAULT 'uk',
    made_for_kids INTEGER NOT NULL DEFAULT 0,
    contains_synthetic_media INTEGER NOT NULL DEFAULT 0,
    has_paid_product_placement INTEGER NOT NULL DEFAULT 0,
    notify_subscribers INTEGER NOT NULL DEFAULT 1,
    embeddable INTEGER NOT NULL DEFAULT 1,
    public_stats_viewable INTEGER NOT NULL DEFAULT 1,
    license TEXT NOT NULL DEFAULT 'youtube',
    privacy_status TEXT NOT NULL DEFAULT 'public',
    publish_mode TEXT NOT NULL DEFAULT 'youtube_schedule',
    scheduled_for TEXT,
    wait_for_processing INTEGER NOT NULL DEFAULT 1,
    playlist_id TEXT NOT NULL DEFAULT '',
    video_filename TEXT NOT NULL,
    video_external_path TEXT NOT NULL DEFAULT '',
    video_original_name TEXT NOT NULL,
    video_size_bytes INTEGER NOT NULL DEFAULT 0,
    video_mime_type TEXT NOT NULL DEFAULT 'video/mp4',
    thumbnail_filename TEXT NOT NULL DEFAULT '',
    thumbnail_original_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    youtube_video_id TEXT NOT NULL DEFAULT '',
    youtube_url TEXT NOT NULL DEFAULT '',
    api_payload_json TEXT NOT NULL DEFAULT '{}',
    logs_json TEXT NOT NULL DEFAULT '[]',
    error_message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS quota_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pt_date TEXT NOT NULL,
    channel_id INTEGER,
    job_id INTEGER,
    endpoint TEXT NOT NULL,
    units INTEGER NOT NULL DEFAULT 1,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status_sched ON jobs(status, scheduled_for);
  CREATE INDEX IF NOT EXISTS idx_quota_pt_date ON quota_events(pt_date, endpoint, is_demo);
`);

// Safe incremental column migrations for existing local SQLite databases
const jobColumns = db.prepare('PRAGMA table_info(jobs)').all() as Array<{ name: string }>;
if (!jobColumns.some((c) => c.name === 'video_external_path')) {
  db.exec(`ALTER TABLE jobs ADD COLUMN video_external_path TEXT NOT NULL DEFAULT ''`);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function getPtDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function seedInitialData(): void {
  const presetCountRow = db.prepare('SELECT COUNT(*) as cnt FROM presets').get() as { cnt: number };
  let defaultPresetId: number | null = null;

  if (presetCountRow.cnt === 0) {
    const ts = nowIso();
    const res1 = db
      .prepare(
        `INSERT INTO presets (
          name, description_footer, default_tags_json, category_id,
          default_language, default_audio_language, made_for_kids,
          contains_synthetic_media, has_paid_product_placement,
          notify_subscribers, embeddable, public_stats_viewable,
          license, default_privacy, wait_for_processing, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'Базовий пресет (Не для дітей • Не AI)',
        '\n\n—\nПідписуйтесь на канал та ставте вподобайку!',
        JSON.stringify(['youtube', 'нове відео']),
        '22',
        'uk',
        'uk',
        0,
        0,
        0,
        1,
        1,
        1,
        'youtube',
        'public',
        1,
        ts,
        ts
      );
    defaultPresetId = Number(res1.lastInsertRowid);

    db.prepare(
      `INSERT INTO presets (
        name, description_footer, default_tags_json, category_id,
        default_language, default_audio_language, made_for_kids,
        contains_synthetic_media, has_paid_product_placement,
        notify_subscribers, embeddable, public_stats_viewable,
        license, default_privacy, wait_for_processing, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'Shorts-шаблон (Не для дітей • Не AI)',
      '\n\n#shorts',
      JSON.stringify(['shorts', 'рек']),
      '24',
      'uk',
      'uk',
      0,
      0,
      0,
      1,
      1,
      1,
      'youtube',
      'public',
      1,
      ts,
      ts
    );
  } else {
    const first = db.prepare('SELECT id FROM presets ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
    defaultPresetId = first?.id ?? null;
  }

  const channelCountRow = db.prepare('SELECT COUNT(*) as cnt FROM channels').get() as { cnt: number };
  if (channelCountRow.cnt === 0) {
    const ts = nowIso();
    db.prepare(
      `INSERT INTO channels (
        youtube_channel_id, title, handle, avatar_url, google_email,
        subscriber_count, video_count, is_demo, is_active, status,
        default_preset_id, schedule_slots_json, playlists_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'UC_DEMO_SANDBOX_01',
      'Тестовий канал (Sandbox)',
      '@demo_sandbox',
      '',
      'sandbox-demo@local',
      1240,
      18,
      1,
      1,
      'sandbox',
      defaultPresetId,
      JSON.stringify({ days: [1, 2, 3, 4, 5, 6, 0], times: ['12:00', '18:00'] }),
      JSON.stringify([
        { id: 'PL_DEMO_01', title: 'Основні випуски', itemCount: 12 },
        { id: 'PL_DEMO_02', title: 'Shorts', itemCount: 6 },
      ]),
      ts,
      ts
    );
  }
}

seedInitialData();

// ---- Settings ----

function getSettingRaw(key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

function setSettingRaw(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function getAppSettings(): AppSettings {
  const storedClientId = getSettingRaw('google_client_id');
  const storedClientSecretEnc = getSettingRaw('google_client_secret_enc');
  const storedPublicBaseUrl = getSettingRaw('public_base_url');
  const storedTimezone = getSettingRaw('timezone');
  const storedLeadMinutes = getSettingRaw('pre_upload_lead_minutes');
  const storedAdminPasswordHash = getSettingRaw('admin_password_hash');

  let clientSecret = config.envGoogleClientSecret;
  if (storedClientSecretEnc) {
    try {
      clientSecret = decryptSecret(storedClientSecretEnc);
    } catch {
      clientSecret = config.envGoogleClientSecret;
    }
  }

  return {
    googleClientId: storedClientId || config.envGoogleClientId,
    googleClientSecret: clientSecret,
    publicBaseUrl: (storedPublicBaseUrl || config.publicBaseUrl).replace(/\/+$/, ''),
    timezone: storedTimezone || 'Europe/Kyiv',
    preUploadLeadMinutes: Math.max(0, Number(storedLeadMinutes || 120)),
    adminPasswordHash: storedAdminPasswordHash,
  };
}

export function updateAppSettings(patch: {
  googleClientId?: string;
  googleClientSecret?: string;
  publicBaseUrl?: string;
  timezone?: string;
  preUploadLeadMinutes?: number;
}): void {
  if (typeof patch.googleClientId === 'string') {
    setSettingRaw('google_client_id', patch.googleClientId.trim());
  }
  if (typeof patch.googleClientSecret === 'string' && patch.googleClientSecret.trim() !== '') {
    setSettingRaw('google_client_secret_enc', encryptSecret(patch.googleClientSecret.trim()));
  }
  if (typeof patch.publicBaseUrl === 'string' && patch.publicBaseUrl.trim() !== '') {
    setSettingRaw('public_base_url', patch.publicBaseUrl.trim().replace(/\/+$/, ''));
  }
  if (typeof patch.timezone === 'string' && patch.timezone.trim() !== '') {
    setSettingRaw('timezone', patch.timezone.trim());
  }
  if (typeof patch.preUploadLeadMinutes === 'number' && !Number.isNaN(patch.preUploadLeadMinutes)) {
    setSettingRaw('pre_upload_lead_minutes', String(Math.max(0, Math.min(1440, Math.round(patch.preUploadLeadMinutes)))));
  }
}

// ---- OAuth States ----

export function createOAuthState(state: string, returnOrigin: string, mode = 'redirect'): void {
  const cutoff = Date.now() - 30 * 60 * 1000;
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(cutoff);
  db.prepare('INSERT INTO oauth_states (state, return_origin, mode, created_at) VALUES (?, ?, ?, ?)').run(
    state,
    returnOrigin,
    mode,
    Date.now()
  );
}

export function consumeOAuthState(state: string): { returnOrigin: string; mode: string } | null {
  const row = db
    .prepare('SELECT return_origin, mode, created_at FROM oauth_states WHERE state = ?')
    .get(state) as { return_origin: string; mode: string; created_at: number } | undefined;
  if (!row) return null;
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  if (Date.now() - row.created_at > 30 * 60 * 1000) return null;
  return { returnOrigin: row.return_origin, mode: row.mode };
}

// ---- Presets ----

function mapPresetRow(row: Record<string, unknown>): PresetRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    descriptionFooter: String(row.description_footer ?? ''),
    defaultTags: safeJsonParse<string[]>(String(row.default_tags_json ?? '[]'), []),
    categoryId: String(row.category_id ?? '22'),
    defaultLanguage: String(row.default_language ?? 'uk'),
    defaultAudioLanguage: String(row.default_audio_language ?? 'uk'),
    madeForKids: Boolean(row.made_for_kids),
    containsSyntheticMedia: Boolean(row.contains_synthetic_media),
    hasPaidProductPlacement: Boolean(row.has_paid_product_placement),
    notifySubscribers: Boolean(row.notify_subscribers),
    embeddable: Boolean(row.embeddable),
    publicStatsViewable: Boolean(row.public_stats_viewable),
    license: row.license === 'creativeCommon' ? 'creativeCommon' : 'youtube',
    defaultPrivacy:
      row.default_privacy === 'unlisted' || row.default_privacy === 'private' ? row.default_privacy : 'public',
    waitForProcessing: Boolean(row.wait_for_processing),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listPresets(): PresetRecord[] {
  const rows = db.prepare('SELECT * FROM presets ORDER BY id ASC').all() as Record<string, unknown>[];
  return rows.map(mapPresetRow);
}

export function getPresetById(id: number): PresetRecord | null {
  const row = db.prepare('SELECT * FROM presets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapPresetRow(row) : null;
}

export function createPreset(input: Omit<PresetRecord, 'id' | 'createdAt' | 'updatedAt'>): PresetRecord {
  const ts = nowIso();
  const res = db
    .prepare(
      `INSERT INTO presets (
        name, description_footer, default_tags_json, category_id,
        default_language, default_audio_language, made_for_kids,
        contains_synthetic_media, has_paid_product_placement,
        notify_subscribers, embeddable, public_stats_viewable,
        license, default_privacy, wait_for_processing, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      input.descriptionFooter,
      JSON.stringify(input.defaultTags),
      input.categoryId,
      input.defaultLanguage,
      input.defaultAudioLanguage,
      input.madeForKids ? 1 : 0,
      input.containsSyntheticMedia ? 1 : 0,
      input.hasPaidProductPlacement ? 1 : 0,
      input.notifySubscribers ? 1 : 0,
      input.embeddable ? 1 : 0,
      input.publicStatsViewable ? 1 : 0,
      input.license,
      input.defaultPrivacy,
      input.waitForProcessing ? 1 : 0,
      ts,
      ts
    );
  return getPresetById(Number(res.lastInsertRowid))!;
}

export function updatePreset(id: number, input: Omit<PresetRecord, 'id' | 'createdAt' | 'updatedAt'>): PresetRecord | null {
  const existing = getPresetById(id);
  if (!existing) return null;
  const ts = nowIso();
  db.prepare(
    `UPDATE presets SET
      name = ?, description_footer = ?, default_tags_json = ?, category_id = ?,
      default_language = ?, default_audio_language = ?, made_for_kids = ?,
      contains_synthetic_media = ?, has_paid_product_placement = ?,
      notify_subscribers = ?, embeddable = ?, public_stats_viewable = ?,
      license = ?, default_privacy = ?, wait_for_processing = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name.trim(),
    input.descriptionFooter,
    JSON.stringify(input.defaultTags),
    input.categoryId,
    input.defaultLanguage,
    input.defaultAudioLanguage,
    input.madeForKids ? 1 : 0,
    input.containsSyntheticMedia ? 1 : 0,
    input.hasPaidProductPlacement ? 1 : 0,
    input.notifySubscribers ? 1 : 0,
    input.embeddable ? 1 : 0,
    input.publicStatsViewable ? 1 : 0,
    input.license,
    input.defaultPrivacy,
    input.waitForProcessing ? 1 : 0,
    ts,
    id
  );
  return getPresetById(id);
}

export function deletePreset(id: number): boolean {
  const res = db.prepare('DELETE FROM presets WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// ---- Channels ----

function mapChannelRow(row: Record<string, unknown>): ChannelRecord {
  return {
    id: Number(row.id),
    youtubeChannelId: String(row.youtube_channel_id),
    title: String(row.title),
    handle: String(row.handle ?? ''),
    avatarUrl: String(row.avatar_url ?? ''),
    googleEmail: String(row.google_email ?? ''),
    subscriberCount: Number(row.subscriber_count ?? 0),
    videoCount: Number(row.video_count ?? 0),
    isDemo: Boolean(row.is_demo),
    isActive: Boolean(row.is_active),
    status: (row.status as ChannelRecord['status']) || 'connected',
    lastError: String(row.last_error ?? ''),
    defaultPresetId: row.default_preset_id === null || row.default_preset_id === undefined ? null : Number(row.default_preset_id),
    scheduleSlots: safeJsonParse<ScheduleSlots>(String(row.schedule_slots_json ?? '{}'), {
      days: [1, 2, 3, 4, 5, 6, 0],
      times: ['12:00', '18:00'],
    }),
    playlists: safeJsonParse<PlaylistSummary[]>(String(row.playlists_json ?? '[]'), []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listChannels(): ChannelRecord[] {
  const rows = db.prepare('SELECT * FROM channels ORDER BY is_demo ASC, id ASC').all() as Record<string, unknown>[];
  return rows.map(mapChannelRow);
}

export function getChannelById(id: number): ChannelRecord | null {
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapChannelRow(row) : null;
}

export function getChannelTokens(id: number): { accessToken: string; refreshToken: string; tokenExpiry: number } | null {
  const row = db
    .prepare('SELECT access_token_enc, refresh_token_enc, token_expiry FROM channels WHERE id = ?')
    .get(id) as { access_token_enc: string; refresh_token_enc: string; token_expiry: number } | undefined;
  if (!row) return null;
  return {
    accessToken: row.access_token_enc ? decryptSecret(row.access_token_enc) : '',
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : '',
    tokenExpiry: Number(row.token_expiry ?? 0),
  };
}

export function upsertYouTubeChannel(input: {
  youtubeChannelId: string;
  title: string;
  handle: string;
  avatarUrl: string;
  googleEmail: string;
  subscriberCount: number;
  videoCount: number;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  playlists: PlaylistSummary[];
  isDemo?: boolean;
}): ChannelRecord {
  const ts = nowIso();
  const existing = db
    .prepare('SELECT id, refresh_token_enc, default_preset_id FROM channels WHERE youtube_channel_id = ?')
    .get(input.youtubeChannelId) as
    | { id: number; refresh_token_enc: string; default_preset_id: number | null }
    | undefined;

  const encAccess = input.accessToken ? encryptSecret(input.accessToken) : '';
  const encRefresh = input.refreshToken
    ? encryptSecret(input.refreshToken)
    : existing?.refresh_token_enc || '';

  if (existing) {
    db.prepare(
      `UPDATE channels SET
        title = ?, handle = ?, avatar_url = ?, google_email = ?,
        subscriber_count = ?, video_count = ?,
        access_token_enc = ?, refresh_token_enc = ?, token_expiry = ?,
        is_demo = ?, status = ?, last_error = '', playlists_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      input.title,
      input.handle,
      input.avatarUrl,
      input.googleEmail,
      input.subscriberCount,
      input.videoCount,
      encAccess,
      encRefresh,
      input.tokenExpiry,
      input.isDemo ? 1 : 0,
      input.isDemo ? 'sandbox' : 'connected',
      JSON.stringify(input.playlists),
      ts,
      existing.id
    );
    return getChannelById(existing.id)!;
  }

  const firstPreset = db.prepare('SELECT id FROM presets ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
  const res = db
    .prepare(
      `INSERT INTO channels (
        youtube_channel_id, title, handle, avatar_url, google_email,
        subscriber_count, video_count, access_token_enc, refresh_token_enc, token_expiry,
        is_demo, is_active, status, default_preset_id, playlists_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
    )
    .run(
      input.youtubeChannelId,
      input.title,
      input.handle,
      input.avatarUrl,
      input.googleEmail,
      input.subscriberCount,
      input.videoCount,
      encAccess,
      encRefresh,
      input.tokenExpiry,
      input.isDemo ? 1 : 0,
      input.isDemo ? 'sandbox' : 'connected',
      firstPreset?.id ?? null,
      JSON.stringify(input.playlists),
      ts,
      ts
    );

  return getChannelById(Number(res.lastInsertRowid))!;
}

export function updateChannelTokens(id: number, accessToken: string, tokenExpiry: number, refreshToken?: string): void {
  const ts = nowIso();
  if (refreshToken) {
    db.prepare(
      `UPDATE channels SET access_token_enc = ?, refresh_token_enc = ?, token_expiry = ?, status = 'connected', last_error = '', updated_at = ? WHERE id = ?`
    ).run(encryptSecret(accessToken), encryptSecret(refreshToken), tokenExpiry, ts, id);
  } else {
    db.prepare(
      `UPDATE channels SET access_token_enc = ?, token_expiry = ?, status = 'connected', last_error = '', updated_at = ? WHERE id = ?`
    ).run(encryptSecret(accessToken), tokenExpiry, ts, id);
  }
}

export function updateChannelSettings(
  id: number,
  patch: {
    isActive?: boolean;
    defaultPresetId?: number | null;
    scheduleSlots?: ScheduleSlots;
  }
): ChannelRecord | null {
  const ch = getChannelById(id);
  if (!ch) return null;
  const ts = nowIso();
  db.prepare(
    `UPDATE channels SET
      is_active = ?, default_preset_id = ?, schedule_slots_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    patch.isActive === undefined ? (ch.isActive ? 1 : 0) : patch.isActive ? 1 : 0,
    patch.defaultPresetId === undefined ? ch.defaultPresetId : patch.defaultPresetId,
    JSON.stringify(patch.scheduleSlots ?? ch.scheduleSlots),
    ts,
    id
  );
  return getChannelById(id);
}

export function setChannelStatus(id: number, status: ChannelRecord['status'], lastError = ''): void {
  db.prepare('UPDATE channels SET status = ?, last_error = ?, updated_at = ? WHERE id = ?').run(
    status,
    lastError,
    nowIso(),
    id
  );
}

export function deleteChannel(id: number): boolean {
  const res = db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// ---- Jobs ----

function mapJobRow(row: Record<string, unknown>): JobRecord {
  return {
    id: Number(row.id),
    channelId: Number(row.channel_id),
    channelTitle: row.channel_title !== undefined ? String(row.channel_title) : undefined,
    channelHandle: row.channel_handle !== undefined ? String(row.channel_handle) : undefined,
    channelAvatarUrl: row.channel_avatar_url !== undefined ? String(row.channel_avatar_url) : undefined,
    channelIsDemo: row.channel_is_demo !== undefined ? Boolean(row.channel_is_demo) : undefined,
    title: String(row.title),
    description: String(row.description ?? ''),
    tags: safeJsonParse<string[]>(String(row.tags_json ?? '[]'), []),
    categoryId: String(row.category_id ?? '22'),
    defaultLanguage: String(row.default_language ?? 'uk'),
    defaultAudioLanguage: String(row.default_audio_language ?? 'uk'),
    madeForKids: Boolean(row.made_for_kids),
    containsSyntheticMedia: Boolean(row.contains_synthetic_media),
    hasPaidProductPlacement: Boolean(row.has_paid_product_placement),
    notifySubscribers: Boolean(row.notify_subscribers),
    embeddable: Boolean(row.embeddable),
    publicStatsViewable: Boolean(row.public_stats_viewable),
    license: row.license === 'creativeCommon' ? 'creativeCommon' : 'youtube',
    privacyStatus:
      row.privacy_status === 'unlisted' || row.privacy_status === 'private' ? row.privacy_status : 'public',
    publishMode: (row.publish_mode as PublishMode) || 'youtube_schedule',
    scheduledFor: row.scheduled_for ? String(row.scheduled_for) : null,
    waitForProcessing: Boolean(row.wait_for_processing),
    playlistId: String(row.playlist_id ?? ''),
    videoFilename: String(row.video_filename),
    videoExternalPath: String(row.video_external_path ?? ''),
    videoOriginalName: String(row.video_original_name),
    videoSizeBytes: Number(row.video_size_bytes ?? 0),
    videoMimeType: String(row.video_mime_type ?? 'video/mp4'),
    thumbnailFilename: String(row.thumbnail_filename ?? ''),
    thumbnailOriginalName: String(row.thumbnail_original_name ?? ''),
    status: (row.status as JobStatus) || 'queued',
    progress: Number(row.progress ?? 0),
    youtubeVideoId: String(row.youtube_video_id ?? ''),
    youtubeUrl: String(row.youtube_url ?? ''),
    apiPayload: safeJsonParse<Record<string, unknown>>(String(row.api_payload_json ?? '{}'), {}),
    logs: safeJsonParse<JobLogEntry[]>(String(row.logs_json ?? '[]'), []),
    errorMessage: String(row.error_message ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

export function listJobs(filter?: { status?: string; channelId?: number }): JobRecord[] {
  let sql = `
    SELECT j.*, c.title as channel_title, c.handle as channel_handle,
           c.avatar_url as channel_avatar_url, c.is_demo as channel_is_demo
    FROM jobs j
    JOIN channels c ON c.id = j.channel_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (filter?.status && filter.status !== 'all') {
    sql += ' AND j.status = ?';
    params.push(filter.status);
  }
  if (filter?.channelId) {
    sql += ' AND j.channel_id = ?';
    params.push(filter.channelId);
  }
  sql += ' ORDER BY CASE WHEN j.status IN (\'uploading\',\'processing\',\'queued\') THEN 0 WHEN j.status = \'scheduled\' THEN 1 ELSE 2 END, COALESCE(j.scheduled_for, j.created_at) ASC, j.id DESC';

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapJobRow);
}

export function getJobById(id: number): JobRecord | null {
  const row = db
    .prepare(
      `SELECT j.*, c.title as channel_title, c.handle as channel_handle,
              c.avatar_url as channel_avatar_url, c.is_demo as channel_is_demo
       FROM jobs j
       JOIN channels c ON c.id = j.channel_id
       WHERE j.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapJobRow(row) : null;
}

export function createJob(input: {
  channelId: number;
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
  publishMode: PublishMode;
  scheduledFor: string | null;
  waitForProcessing: boolean;
  playlistId: string;
  videoFilename: string;
  videoExternalPath?: string;
  videoOriginalName: string;
  videoSizeBytes: number;
  videoMimeType: string;
  thumbnailFilename: string;
  thumbnailOriginalName: string;
  apiPayload: Record<string, unknown>;
}): JobRecord {
  const ts = nowIso();
  const initialStatus: JobStatus =
    input.publishMode === 'server_schedule' || input.publishMode === 'youtube_schedule'
      ? 'scheduled'
      : 'queued';

  const initialLog: JobLogEntry = {
    at: ts,
    level: 'info',
    message:
      initialStatus === 'scheduled'
        ? `Завдання створено та заплановано на ${input.scheduledFor}`
        : 'Завдання додано в чергу на завантаження',
  };

  const res = db
    .prepare(
      `INSERT INTO jobs (
        channel_id, title, description, tags_json, category_id,
        default_language, default_audio_language,
        made_for_kids, contains_synthetic_media, has_paid_product_placement,
        notify_subscribers, embeddable, public_stats_viewable, license,
        privacy_status, publish_mode, scheduled_for, wait_for_processing, playlist_id,
        video_filename, video_external_path, video_original_name, video_size_bytes, video_mime_type,
        thumbnail_filename, thumbnail_original_name,
        status, progress, api_payload_json, logs_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    )
    .run(
      input.channelId,
      input.title,
      input.description,
      JSON.stringify(input.tags),
      input.categoryId,
      input.defaultLanguage,
      input.defaultAudioLanguage,
      input.madeForKids ? 1 : 0,
      input.containsSyntheticMedia ? 1 : 0,
      input.hasPaidProductPlacement ? 1 : 0,
      input.notifySubscribers ? 1 : 0,
      input.embeddable ? 1 : 0,
      input.publicStatsViewable ? 1 : 0,
      input.license,
      input.privacyStatus,
      input.publishMode,
      input.scheduledFor,
      input.waitForProcessing ? 1 : 0,
      input.playlistId,
      input.videoFilename,
      input.videoExternalPath || '',
      input.videoOriginalName,
      input.videoSizeBytes,
      input.videoMimeType,
      input.thumbnailFilename,
      input.thumbnailOriginalName,
      initialStatus,
      JSON.stringify(input.apiPayload),
      JSON.stringify([initialLog]),
      ts,
      ts
    );

  return getJobById(Number(res.lastInsertRowid))!;
}

export function appendJobLog(id: number, level: JobLogEntry['level'], message: string): void {
  const job = getJobById(id);
  if (!job) return;
  const logs = [...job.logs, { at: nowIso(), level, message }].slice(-100);
  db.prepare('UPDATE jobs SET logs_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(logs),
    nowIso(),
    id
  );
}

export function updateJobState(
  id: number,
  patch: {
    status?: JobStatus;
    progress?: number;
    youtubeVideoId?: string;
    youtubeUrl?: string;
    errorMessage?: string;
    apiPayload?: Record<string, unknown>;
    completedAt?: string | null;
  }
): void {
  const job = getJobById(id);
  if (!job) return;
  db.prepare(
    `UPDATE jobs SET
      status = ?, progress = ?, youtube_video_id = ?, youtube_url = ?,
      error_message = ?, api_payload_json = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    patch.status ?? job.status,
    patch.progress ?? job.progress,
    patch.youtubeVideoId ?? job.youtubeVideoId,
    patch.youtubeUrl ?? job.youtubeUrl,
    patch.errorMessage ?? job.errorMessage,
    JSON.stringify(patch.apiPayload ?? job.apiPayload),
    patch.completedAt === undefined ? job.completedAt : patch.completedAt,
    nowIso(),
    id
  );
}

export function updateJobMetadata(
  id: number,
  patch: {
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    madeForKids?: boolean;
    containsSyntheticMedia?: boolean;
    hasPaidProductPlacement?: boolean;
    notifySubscribers?: boolean;
    embeddable?: boolean;
    publicStatsViewable?: boolean;
    license?: 'youtube' | 'creativeCommon';
    privacyStatus?: 'public' | 'unlisted' | 'private';
    publishMode?: PublishMode;
    scheduledFor?: string | null;
    status?: JobStatus;
    apiPayload?: Record<string, unknown>;
  }
): JobRecord | null {
  const job = getJobById(id);
  if (!job) return null;
  db.prepare(
    `UPDATE jobs SET
      title = ?, description = ?, tags_json = ?, category_id = ?,
      made_for_kids = ?, contains_synthetic_media = ?, has_paid_product_placement = ?,
      notify_subscribers = ?, embeddable = ?, public_stats_viewable = ?,
      license = ?, privacy_status = ?, publish_mode = ?, scheduled_for = ?,
      status = ?, api_payload_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    patch.title ?? job.title,
    patch.description ?? job.description,
    JSON.stringify(patch.tags ?? job.tags),
    patch.categoryId ?? job.categoryId,
    (patch.madeForKids ?? job.madeForKids) ? 1 : 0,
    (patch.containsSyntheticMedia ?? job.containsSyntheticMedia) ? 1 : 0,
    (patch.hasPaidProductPlacement ?? job.hasPaidProductPlacement) ? 1 : 0,
    (patch.notifySubscribers ?? job.notifySubscribers) ? 1 : 0,
    (patch.embeddable ?? job.embeddable) ? 1 : 0,
    (patch.publicStatsViewable ?? job.publicStatsViewable) ? 1 : 0,
    patch.license ?? job.license,
    patch.privacyStatus ?? job.privacyStatus,
    patch.publishMode ?? job.publishMode,
    patch.scheduledFor === undefined ? job.scheduledFor : patch.scheduledFor,
    patch.status ?? job.status,
    JSON.stringify(patch.apiPayload ?? job.apiPayload),
    nowIso(),
    id
  );
  return getJobById(id);
}

export function deleteJob(id: number): boolean {
  const res = db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function resetInterruptedJobs(): void {
  db.prepare(
    `UPDATE jobs SET status = 'queued', progress = 0, updated_at = ?
     WHERE status IN ('uploading', 'processing')`
  ).run(nowIso());
}

// ---- Quota tracking ----

export function recordQuotaEvent(input: {
  channelId: number;
  jobId: number;
  endpoint: string;
  units: number;
  isDemo: boolean;
}): void {
  db.prepare(
    `INSERT INTO quota_events (pt_date, channel_id, job_id, endpoint, units, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    getPtDateString(),
    input.channelId,
    input.jobId,
    input.endpoint,
    input.units,
    input.isDemo ? 1 : 0,
    nowIso()
  );
}

export function getTodayQuotaSummary(): {
  ptDate: string;
  liveUploadsUsed: number;
  liveUploadsLimit: number;
  demoUploadsCount: number;
} {
  const ptDate = getPtDateString();
  const liveRow = db
    .prepare(
      `SELECT COALESCE(SUM(units), 0) as total
       FROM quota_events
       WHERE pt_date = ? AND endpoint = 'videos.insert' AND is_demo = 0`
    )
    .get(ptDate) as { total: number };
  const demoRow = db
    .prepare(
      `SELECT COALESCE(SUM(units), 0) as total
       FROM quota_events
       WHERE pt_date = ? AND endpoint = 'videos.insert' AND is_demo = 1`
    )
    .get(ptDate) as { total: number };

  return {
    ptDate,
    liveUploadsUsed: Number(liveRow.total ?? 0),
    liveUploadsLimit: 100,
    demoUploadsCount: Number(demoRow.total ?? 0),
  };
}
