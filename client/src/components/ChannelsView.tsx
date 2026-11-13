import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FlaskConical,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  Tv,
  Users,
  Video,
} from 'lucide-react';
import { api } from '../api';
import { WEEKDAYS_UK } from '../constants/youtube';
import type { ChannelRecord, PresetRecord, SettingsResponse } from '../types';

interface ChannelsViewProps {
  channels: ChannelRecord[];
  presets: PresetRecord[];
  settings: SettingsResponse | null;
  onRefresh: () => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
  onGoToSettings: () => void;
}

export function ChannelsView({
  channels,
  presets,
  settings,
  onRefresh,
  onNotify,
  onGoToSettings,
}: ChannelsViewProps) {
  const [connecting, setConnecting] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [newTimeInput, setNewTimeInput] = useState<Record<number, string>>({});

  async function handleConnectRedirect() {
    setConnecting(true);
    try {
      if (window.electronDesktop?.isDesktop) {
        const { url } = await api.createOAuthUrl('desktop');
        await window.electronDesktop.openExternal(url);
        onNotify(
          'success',
          'Відкрито системний браузер для авторизації Google. Після підтвердження канал з’явиться тут автоматично.'
        );
        setConnecting(false);
        return;
      }
      const { url } = await api.createOAuthUrl('redirect');
      window.location.href = url;
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка створення OAuth-посилання');
      setConnecting(false);
    }
  }

  async function handleCopyOAuthLink() {
    try {
      const { url } = await api.createOAuthUrl('copy');
      await navigator.clipboard.writeText(url);
      onNotify(
        'success',
        'OAuth-посилання скопійовано! Відкрийте його в інкогніто або в іншому профілі браузера з потрібним Google-акаунтом.'
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Не вдалося згенерувати OAuth-посилання');
    }
  }

  async function handleAddDemo() {
    setCreatingDemo(true);
    try {
      await api.createDemoChannel();
      onRefresh();
      onNotify('success', 'Додано тестовий Sandbox-канал');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка створення демо-каналу');
    } finally {
      setCreatingDemo(false);
    }
  }

  async function handleToggleActive(ch: ChannelRecord) {
    try {
      await api.updateChannel(ch.id, { isActive: !ch.isActive });
      onRefresh();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка оновлення');
    }
  }

  async function handleChangePreset(ch: ChannelRecord, presetId: string) {
    try {
      await api.updateChannel(ch.id, {
        defaultPresetId: presetId ? Number(presetId) : null,
      });
      onRefresh();
      onNotify('success', `Оновлено пресет за замовчуванням для «${ch.title}»`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handleToggleDay(ch: ChannelRecord, day: number) {
    const exists = ch.scheduleSlots.days.includes(day);
    const nextDays = exists
      ? ch.scheduleSlots.days.filter((d) => d !== day)
      : [...ch.scheduleSlots.days, day];
    try {
      await api.updateChannel(ch.id, {
        scheduleSlots: { days: nextDays, times: ch.scheduleSlots.times },
      });
      onRefresh();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handleAddSlotTime(ch: ChannelRecord) {
    const val = (newTimeInput[ch.id] || '').trim();
    if (!/^\d{2}:\d{2}$/.test(val)) {
      onNotify('error', 'Введіть час у форматі ГГ:ХХ (напр. 18:30)');
      return;
    }
    const nextTimes = [...new Set([...ch.scheduleSlots.times, val])].sort();
    try {
      await api.updateChannel(ch.id, {
        scheduleSlots: { days: ch.scheduleSlots.days, times: nextTimes },
      });
      setNewTimeInput((prev) => ({ ...prev, [ch.id]: '' }));
      onRefresh();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handleRemoveSlotTime(ch: ChannelRecord, time: string) {
    const nextTimes = ch.scheduleSlots.times.filter((t) => t !== time);
    try {
      await api.updateChannel(ch.id, {
        scheduleSlots: { days: ch.scheduleSlots.days, times: nextTimes.length ? nextTimes : ['18:00'] },
      });
      onRefresh();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handleRefreshFromYouTube(ch: ChannelRecord) {
    setRefreshingId(ch.id);
    try {
      await api.refreshChannel(ch.id);
      onRefresh();
      onNotify('success', `Дані каналу «${ch.title}» оновлено з YouTube`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка оновлення');
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleDelete(ch: ChannelRecord) {
    try {
      await api.deleteChannel(ch.id, !ch.isDemo);
      onRefresh();
      onNotify('success', `Канал «${ch.title}» видалено`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка видалення');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Підключені YouTube-канали</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Підключайте необмежену кількість каналів із різних Google-акаунтів через один Google OAuth проєкт.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleConnectRedirect}
            disabled={connecting || !settings?.oauthConfigured}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold shadow-lg shadow-rose-950/40 cursor-pointer disabled:opacity-40"
          >
            <Link2 className="w-4 h-4" />
            Підключити YouTube (OAuth)
          </button>

          <button
            onClick={handleCopyOAuthLink}
            disabled={!settings?.oauthConfigured}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium cursor-pointer disabled:opacity-40"
            title="Зручно, якщо кожен канал у своєму профілі Chrome або в інкогніто"
          >
            <Copy className="w-4 h-4 text-sky-400" />
            Скопіювати OAuth-лінk (для інкогніто)
          </button>

          <button
            onClick={handleAddDemo}
            disabled={creatingDemo}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 text-sm font-medium cursor-pointer"
          >
            <FlaskConical className="w-4 h-4" />
            + Sandbox-канал
          </button>
        </div>
      </div>

      {!settings?.oauthConfigured && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-100 leading-relaxed">
              <strong>Google Client ID / Client Secret ще не вказані.</strong> Ви вже можете тестувати весь
              функціонал на Sandbox-каналі, а для підключення реальних YouTube-каналів введіть ключі у розділі
              «Налаштування Google API».
            </div>
          </div>
          <button
            onClick={onGoToSettings}
            className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs shrink-0 cursor-pointer hover:bg-amber-400"
          >
            Налаштувати API
          </button>
        </div>
      )}

      {/* Tip for multiple Google accounts */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 text-xs text-slate-300 leading-relaxed">
        <strong className="text-white">Порада для різних Google-акаунтів:</strong> щоб не перелогінюватись щоразу
        в основному браузері, натисніть <em>«Скопіювати OAuth-лінk (для інкогніто)»</em> і вставте посилання в
        окремий профіль браузера (чи вікно Інкогніто), де відкритий потрібний Google-акаунт. Після підтвердження
        канал автоматично з’явиться тут.
      </div>

      {channels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center">
          <Tv className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <div className="text-sm text-slate-300">Каналів ще немає</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className={`bg-slate-900/75 border rounded-2xl p-5 space-y-4 ${
                ch.status === 'error'
                  ? 'border-rose-500/40'
                  : ch.isActive
                    ? 'border-slate-800'
                    : 'border-slate-800/50 opacity-70'
              }`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  {ch.avatarUrl ? (
                    <img
                      src={ch.avatarUrl}
                      alt={ch.title}
                      className="w-12 h-12 rounded-full object-cover border border-slate-700"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-rose-300">
                      {ch.title.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-white truncate">{ch.title}</h3>
                      {ch.isDemo ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Sandbox
                        </span>
                      ) : ch.status === 'error' ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                          Помилка токена
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          OAuth активний
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {ch.handle || ch.youtubeChannelId} {ch.googleEmail ? `• ${ch.googleEmail}` : ''}
                    </div>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={ch.isActive}
                    onChange={() => handleToggleActive(ch)}
                    className="w-4 h-4 accent-rose-500"
                  />
                  Активний
                </label>
              </div>

              {ch.lastError && (
                <div className="rounded-xl bg-rose-950/60 border border-rose-500/30 px-3 py-2 text-xs text-rose-200">
                  {ch.lastError}
                </div>
              )}

              {/* Stats & Default Preset */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="flex items-center gap-4 text-xs text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-xl px-3.5 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <strong className="text-slate-200">{ch.subscriberCount.toLocaleString('uk-UA')}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-slate-500" />
                    <strong className="text-slate-200">{ch.videoCount}</strong> відео
                  </span>
                  <span>Плейлистів: {ch.playlists.length}</span>
                </div>

                <select
                  value={ch.defaultPresetId ?? ''}
                  onChange={(e) => handleChangePreset(ch, e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value="">Без авто-пресету</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      Авто-пресет: {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Channel Schedule Slots */}
              <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3.5 space-y-2.5">
                <div className="text-xs font-semibold text-slate-300">Слоти авто-розкладу цього каналу</div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS_UK.map((d) => {
                    const on = ch.scheduleSlots.days.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleToggleDay(ch, d.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                          on
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                            : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {ch.scheduleSlots.times.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => handleRemoveSlotTime(ch, t)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  <div className="inline-flex items-center gap-1">
                    <input
                      type="time"
                      value={newTimeInput[ch.id] || ''}
                      onChange={(e) => setNewTimeInput((prev) => ({ ...prev, [ch.id]: e.target.value }))}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSlotTime(ch)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      title="Додати час"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between pt-1">
                {!ch.isDemo ? (
                  <button
                    onClick={() => handleRefreshFromYouTube(ch)}
                    disabled={refreshingId === ch.id}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === ch.id ? 'animate-spin' : ''}`} />
                    Оновити плейлисти та статистику
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">Демо-канал для локальної перевірки</span>
                )}

                <button
                  onClick={() => handleDelete(ch)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Відключити
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
