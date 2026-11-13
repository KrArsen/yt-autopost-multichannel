import type {
  AuthStatusResponse,
  ChannelRecord,
  JobRecord,
  PresetRecord,
  ScheduleSlots,
  SettingsResponse,
} from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  getAuthStatus: () => request<AuthStatusResponse>('/api/auth/status'),
  login: (password: string) =>
    request<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getSettings: () => request<SettingsResponse>('/api/settings'),
  updateSettings: (body: {
    googleClientId?: string;
    googleClientSecret?: string;
    publicBaseUrl?: string;
    timezone?: string;
    preUploadLeadMinutes?: number;
  }) =>
    request<SettingsResponse>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  getChannels: () => request<{ channels: ChannelRecord[] }>('/api/channels'),
  createOAuthUrl: (mode: 'redirect' | 'copy' | 'desktop') =>
    request<{ url: string; state: string }>('/api/channels/oauth-url', {
      method: 'POST',
      body: JSON.stringify({ mode, returnOrigin: window.location.origin }),
    }),
  createDemoChannel: (title?: string) =>
    request<{ channel: ChannelRecord }>('/api/channels/demo', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  updateChannel: (
    id: number,
    patch: { isActive?: boolean; defaultPresetId?: number | null; scheduleSlots?: ScheduleSlots }
  ) =>
    request<{ channel: ChannelRecord }>(`/api/channels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  refreshChannel: (id: number) =>
    request<{ channel: ChannelRecord }>(`/api/channels/${id}/refresh`, { method: 'POST' }),
  getNextChannelSlot: (id: number) =>
    request<{ nextSlotIso: string; timezone: string }>(`/api/channels/${id}/next-slot`),
  deleteChannel: (id: number, revoke = false) =>
    request<{ ok: boolean }>(`/api/channels/${id}?revoke=${revoke ? '1' : '0'}`, {
      method: 'DELETE',
    }),

  getPresets: () => request<{ presets: PresetRecord[] }>('/api/presets'),
  createPreset: (body: Omit<PresetRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<{ preset: PresetRecord }>('/api/presets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePreset: (id: number, body: Omit<PresetRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<{ preset: PresetRecord }>(`/api/presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deletePreset: (id: number) => request<{ ok: boolean }>(`/api/presets/${id}`, { method: 'DELETE' }),

  getJobs: (status = 'all', channelId?: number) => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (channelId) params.set('channelId', String(channelId));
    return request<{ jobs: JobRecord[]; activeJobId: number | null }>(`/api/jobs?${params.toString()}`);
  },
  updateJob: (id: number, patch: Record<string, unknown>) =>
    request<{ job: JobRecord }>(`/api/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  runJobNow: (id: number) =>
    request<{ job: JobRecord }>(`/api/jobs/${id}/run-now`, { method: 'POST' }),
  retryJob: (id: number) =>
    request<{ job: JobRecord }>(`/api/jobs/${id}/retry`, { method: 'POST' }),
  deleteJob: (id: number) => request<{ ok: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' }),
  createLocalJobs: (body: Record<string, unknown>) =>
    request<{ jobs: JobRecord[] }>('/api/jobs/local', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createJobsWithProgress: (formData: FormData, onProgress: (pct: number) => void): Promise<{ jobs: JobRecord[] }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/jobs');
      xhr.withCredentials = true;

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(parsed as { jobs: JobRecord[] });
          } else {
            reject(new Error(parsed.error || `HTTP ${xhr.status}`));
          }
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Мережева помилка при передачі файлу на сервер'));
      xhr.send(formData);
    }),
};
