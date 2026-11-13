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
  videoExternalPath?: string;
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

export interface SettingsResponse {
  googleClientId: string;
  hasGoogleClientSecret: boolean;
  googleClientSecretMasked: string;
  publicBaseUrl: string;
  redirectUri: string;
  timezone: string;
  preUploadLeadMinutes: number;
  oauthConfigured: boolean;
  scopes: string[];
  isDesktop?: boolean;
  dataDir?: string;
  actualPort?: number;
  quota: {
    ptDate: string;
    liveUploadsUsed: number;
    liveUploadsLimit: number;
    demoUploadsCount: number;
  };
}

export interface AuthStatusResponse {
  passwordEnabled: boolean;
  authenticated: boolean;
}

export interface PickedLocalFile {
  path: string;
  name: string;
  size: number;
}

export interface ElectronDesktopBridge {
  isDesktop: boolean;
  getFilePath: (file: File) => string;
  pickVideoFile: () => Promise<PickedLocalFile | null>;
  pickThumbnailFile: () => Promise<PickedLocalFile | null>;
  openExternal: (url: string) => Promise<void>;
  openDataDir: () => Promise<void>;
  getDesktopSettings: () => Promise<{ minimizeToTray: boolean; dataDir: string; version: string }>;
  setMinimizeToTray: (enabled: boolean) => Promise<void>;
  onOAuthCompleted: (
    cb: (payload: { ok: boolean; channelTitle?: string; error?: string }) => void
  ) => () => void;
}

declare global {
  interface Window {
    electronDesktop?: ElectronDesktopBridge;
  }
}
