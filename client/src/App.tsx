import { useCallback, useEffect, useState } from 'react';
import { Lock, Youtube } from 'lucide-react';
import { api } from './api';
import { ChannelsView } from './components/ChannelsView';
import { PresetsView } from './components/PresetsView';
import { QueueView } from './components/QueueView';
import { SettingsView } from './components/SettingsView';
import { Sidebar, type NavTab } from './components/Sidebar';
import { ToastContainer, type ToastItem } from './components/Toast';
import { UploadStudio } from './components/UploadStudio';
import type { ChannelRecord, JobRecord, PresetRecord, SettingsResponse } from './types';

export function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<NavTab>('upload');
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5500);
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const [chRes, prRes, jbRes, stRes] = await Promise.all([
        api.getChannels(),
        api.getPresets(),
        api.getJobs(),
        api.getSettings(),
      ]);
      setChannels(chRes.channels);
      setPresets(prRes.presets);
      setJobs(jbRes.jobs);
      setSettings(stRes);
    } catch (err) {
      console.error('Failed loading studio data:', err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const st = await api.getAuthStatus();
        setPasswordEnabled(st.passwordEnabled);
        setAuthenticated(st.authenticated);
      } catch {
        setAuthenticated(true);
      } finally {
        setAuthChecked(true);
      }
    }
    void init();
  }, []);

  // Read OAuth redirect query params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as NavTab | null;
    const connected = params.get('connected');
    const oauthError = params.get('oauth_error');

    if (tab && ['upload', 'queue', 'channels', 'presets', 'settings'].includes(tab)) {
      setActiveTab(tab);
    }
    if (connected) {
      notify('success', `Канал «${connected}» успішно підключено!`);
    }
    if (oauthError) {
      notify('error', `Помилка OAuth: ${oauthError}`);
    }
    if (tab || connected || oauthError) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [notify]);

  useEffect(() => {
    if (!authenticated) return;
    void loadAllData();
  }, [authenticated, loadAllData]);

  useEffect(() => {
    if (!window.electronDesktop) return;
    return window.electronDesktop.onOAuthCompleted((payload) => {
      void loadAllData();
      setActiveTab('channels');
      if (payload.ok) {
        notify('success', `Канал «${payload.channelTitle || 'YouTube'}» успішно підключено!`);
      } else {
        notify('error', `Помилка OAuth: ${payload.error || 'Невідома помилка'}`);
      }
    });
  }, [loadAllData, notify]);

  // Poll queue progress when active jobs exist or when user is on queue tab, plus refresh on window focus
  useEffect(() => {
    if (!authenticated) return;
    const hasActive = jobs.some((j) => ['queued', 'uploading', 'processing'].includes(j.status));
    const intervalMs = hasActive ? 1500 : activeTab === 'queue' ? 4000 : 10000;
    const timer = setInterval(() => {
      void loadAllData();
    }, intervalMs);

    const onFocus = () => void loadAllData();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [authenticated, jobs, activeTab, loadAllData]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      await api.login(loginPassword);
      setAuthenticated(true);
      setLoginPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Невірний пароль');
    }
  }

  async function handleLogout() {
    await api.logout();
    setAuthenticated(false);
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Завантаження YT AutoPost Studio...
      </div>
    );
  }

  if (passwordEnabled && !authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white">YT AutoPost Studio</h1>
              <p className="text-xs text-slate-400">Вхід у панель керування</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Пароль адміністратора</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                autoFocus
              />
            </div>
          </div>

          {loginError && <div className="text-xs text-rose-400">{loginError}</div>}

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold cursor-pointer"
          >
            Увійти
          </button>
        </form>
      </div>
    );
  }

  const pendingQueueCount = jobs.filter((j) =>
    ['scheduled', 'queued', 'uploading', 'processing'].includes(j.status)
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        queueCount={pendingQueueCount}
        channelsCount={channels.length}
        settings={settings}
        passwordEnabled={passwordEnabled}
        onLogout={handleLogout}
      />

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
        {activeTab === 'upload' && (
          <UploadStudio
            channels={channels}
            presets={presets}
            onCreatedJobs={() => {
              void loadAllData();
              setActiveTab('queue');
            }}
            onPresetCreated={() => void loadAllData()}
            onNotify={notify}
            onGoToChannels={() => setActiveTab('channels')}
          />
        )}

        {activeTab === 'queue' && (
          <QueueView
            jobs={jobs}
            channels={channels}
            onRefresh={() => void loadAllData()}
            onNotify={notify}
          />
        )}

        {activeTab === 'channels' && (
          <ChannelsView
            channels={channels}
            presets={presets}
            settings={settings}
            onRefresh={() => void loadAllData()}
            onNotify={notify}
            onGoToSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'presets' && (
          <PresetsView presets={presets} onRefresh={() => void loadAllData()} onNotify={notify} />
        )}

        {activeTab === 'settings' && (
          <SettingsView settings={settings} onRefresh={() => void loadAllData()} onNotify={notify} />
        )}
      </main>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
