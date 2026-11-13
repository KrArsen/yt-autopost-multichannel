import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Copy, FolderOpen, HardDrive, KeyRound, Save } from 'lucide-react';
import { api } from '../api';
import { TIMEZONES } from '../constants/youtube';
import type { SettingsResponse } from '../types';

interface SettingsViewProps {
  settings: SettingsResponse | null;
  onRefresh: () => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function SettingsView({ settings, onRefresh, onNotify }: SettingsViewProps) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [publicBaseUrl, setPublicBaseUrl] = useState('http://localhost:3456');
  const [timezone, setTimezone] = useState('Europe/Kyiv');
  const [preUploadLeadMinutes, setPreUploadLeadMinutes] = useState(120);
  const [saving, setSaving] = useState(false);
  const [desktopInfo, setDesktopInfo] = useState<{
    minimizeToTray: boolean;
    dataDir: string;
    version: string;
  } | null>(null);

  const isDesktop = Boolean(window.electronDesktop?.isDesktop || settings?.isDesktop);

  useEffect(() => {
    if (window.electronDesktop?.isDesktop) {
      void window.electronDesktop.getDesktopSettings().then(setDesktopInfo).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    setClientId(settings.googleClientId || '');
    setPublicBaseUrl(settings.publicBaseUrl || 'http://localhost:3456');
    setTimezone(settings.timezone || 'Europe/Kyiv');
    setPreUploadLeadMinutes(settings.preUploadLeadMinutes ?? 120);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({
        googleClientId: clientId,
        googleClientSecret: clientSecret || undefined,
        publicBaseUrl,
        timezone,
        preUploadLeadMinutes,
      });
      setClientSecret('');
      onRefresh();
      onNotify('success', 'Налаштування Google API збережено!');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    onNotify('success', 'Скопійовано в буфер обміну');
  }

  async function handleToggleMinimizeToTray(enabled: boolean) {
    if (!window.electronDesktop) return;
    await window.electronDesktop.setMinimizeToTray(enabled);
    setDesktopInfo((prev) => (prev ? { ...prev, minimizeToTray: enabled } : prev));
    onNotify(
      'success',
      enabled
        ? 'Програма згортатиметься у системний трей при закритті вікна'
        : 'Програма повністю завершуватиметься при закритті вікна'
    );
  }

  async function handleOpenDataDir() {
    if (!window.electronDesktop) return;
    await window.electronDesktop.openDataDir();
  }

  const redirectUri = `${publicBaseUrl.replace(/\/+$/, '')}/api/auth/google/callback`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Налаштування Google Cloud OAuth та API</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Усі ключі, токени та база завдань шифруються (AES-256-GCM) і зберігаються локально лише на вашому комп’ютері.
        </p>
      </div>

      {isDesktop && (
        <div className="bg-slate-900/75 border border-emerald-500/30 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <HardDrive className="w-4 h-4 shrink-0" />
              Локальне сховище десктопної програми
              {desktopInfo?.version && (
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                  v{desktopInfo.version}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400">
              Папка даних (SQLite, ключі, прев’ю):{' '}
              <code className="text-slate-200 break-all">{desktopInfo?.dataDir || settings?.dataDir || '%APPDATA%'}</code>
            </div>
            {window.electronDesktop && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={desktopInfo?.minimizeToTray ?? true}
                  onChange={(e) => void handleToggleMinimizeToTray(e.target.checked)}
                  className="rounded border-slate-600 accent-rose-500"
                />
                <span>Згортати у системний трей при закритті вікна (щоб розклад автопостингу працював у фоні)</span>
              </label>
            )}
          </div>

          {window.electronDesktop && (
            <button
              type="button"
              onClick={() => void handleOpenDataDir()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white shrink-0 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-sky-400" />
              Відкрити папку даних
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <form
          onSubmit={handleSave}
          className="xl:col-span-7 bg-slate-900/75 border border-slate-800 rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-rose-400" />
              Ключі Google OAuth 2.0
            </h2>
            {settings?.oauthConfigured && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Готово до підключення каналів
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Google Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="1234567890-xxxxxxxxxx.apps.googleusercontent.com"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Google Client Secret{' '}
              {settings?.hasGoogleClientSecret && (
                <span className="text-slate-500 font-normal">
                  (збережено: {settings.googleClientSecretMasked} — залиште порожнім, щоб не змінювати)
                </span>
              )}
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Базовий URL сервера (без слеша в кінці)
            </label>
            <input
              type="text"
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
              placeholder="http://localhost:3456"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
            />
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs">
              <span className="text-slate-400 truncate">
                Redirect URI: <code className="text-sky-300">{redirectUri}</code>
              </span>
              <button
                type="button"
                onClick={() => copyText(redirectUri)}
                className="inline-flex items-center gap-1 text-slate-300 hover:text-white shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Копіювати
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Часовий пояс розкладу</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Предзалив для <code className="text-sky-300">publishAt</code> (хв до виходу)
              </label>
              <input
                type="number"
                min={0}
                max={1440}
                value={preUploadLeadMinutes}
                onChange={(e) => setPreUploadLeadMinutes(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Збереження...' : 'Зберегти налаштування'}
          </button>
        </form>

        {/* Built-in Setup Guide */}
        <div className="xl:col-span-5 bg-slate-900/75 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-sky-400" />
            Покрокове підключення Google Cloud
          </h2>

          <ol className="space-y-3 text-xs text-slate-300 leading-relaxed list-decimal list-inside">
            <li>
              Відкрийте <strong>Google Cloud Console</strong> → створіть проєкт (напр. <code>YT-AutoPost</code>).
            </li>
            <li>
              У меню <strong>APIs & Services → Library</strong> увімкніть <strong>YouTube Data API v3</strong>.
            </li>
            <li>
              У <strong>Google Auth platform → Audience / OAuth consent screen</strong> оберіть тип{' '}
              <strong>External</strong> і натисніть <strong>Publish App (In Production)</strong>.
              <div className="mt-1 text-amber-300">
                Важливо: у статусі Testing токени злітають кожні 7 днів! У статусі In Production (до 100 каналів для
                себе) верифікацію проходити не обов’язково, але токени не протухають.
              </div>
            </li>
            <li>
              У <strong>Clients → Create OAuth client ID</strong> оберіть тип{' '}
              <strong>Desktop app</strong> (найкраще для Windows-програми — Google автоматично приймає будь-який порт{' '}
              <code>http://127.0.0.1:&lt;port&gt;/api/auth/google/callback</code>) або <strong>Web application</strong> із
              Authorized redirect URI:
              <div className="mt-1 p-2 rounded-lg bg-slate-950 border border-slate-800 text-sky-300 break-all">
                {redirectUri}
              </div>
            </li>
            <li>Скопіюйте Client ID і Client Secret у форму ліворуч та натисніть «Зберегти».</li>
          </ol>

          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 text-xs space-y-1.5">
            <div className="font-semibold text-slate-200">
              Денна квота проєкту (<code className="text-sky-300">videos.insert</code>):
            </div>
            <div className="text-slate-400">
              Використано сьогодні ({settings?.quota.ptDate || 'PT'}):{' '}
              <strong className="text-white">
                {settings?.quota.liveUploadsUsed ?? 0} / {settings?.quota.liveUploadsLimit ?? 100}
              </strong>{' '}
              завантажень. Скидання о 00:00 Pacific Time.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
