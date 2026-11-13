import { useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Code2,
  Edit3,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { ChannelRecord, JobRecord, JobStatus, PublishMode } from '../types';
import { PayloadModal } from './PayloadModal';

interface QueueViewProps {
  jobs: JobRecord[];
  channels: ChannelRecord[];
  onRefresh: () => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const STATUS_BADGE: Record<JobStatus, { label: string; cls: string }> = {
  scheduled: { label: 'Заплановано', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  queued: { label: 'У черзі', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  uploading: { label: 'Завантажується', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  processing: { label: 'Обробка HD', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  published: { label: 'Готово / Залито', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  failed: { label: 'Помилка', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  cancelled: { label: 'Скасовано', cls: 'bg-slate-700/40 text-slate-400 border-slate-700' },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QueueView({ jobs, channels, onRefresh, onNotify }: QueueViewProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [inspectJob, setInspectJob] = useState<JobRecord | null>(null);
  const [editJob, setEditJob] = useState<JobRecord | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMadeForKids, setEditMadeForKids] = useState(false);
  const [editContainsAi, setEditContainsAi] = useState(false);
  const [editPublishMode, setEditPublishMode] = useState<PublishMode>('youtube_schedule');
  const [editScheduledLocal, setEditScheduledLocal] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const filtered = jobs.filter((j) => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (channelFilter !== 'all' && String(j.channelId) !== channelFilter) return false;
    return true;
  });

  const stats = {
    scheduled: jobs.filter((j) => j.status === 'scheduled').length,
    active: jobs.filter((j) => ['queued', 'uploading', 'processing'].includes(j.status)).length,
    published: jobs.filter((j) => j.status === 'published').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  function openEditModal(job: JobRecord) {
    setEditJob(job);
    setEditTitle(job.title);
    setEditDescription(job.description);
    setEditMadeForKids(job.madeForKids);
    setEditContainsAi(job.containsSyntheticMedia);
    setEditPublishMode(job.publishMode);
    setEditScheduledLocal(toLocalInput(job.scheduledFor));
  }

  async function saveEdit() {
    if (!editJob) return;
    setSavingEdit(true);
    try {
      await api.updateJob(editJob.id, {
        title: editTitle,
        description: editDescription,
        madeForKids: editMadeForKids,
        containsSyntheticMedia: editContainsAi,
        publishMode: editPublishMode,
        scheduledFor:
          editPublishMode === 'youtube_schedule' || editPublishMode === 'server_schedule'
            ? new Date(editScheduledLocal).toISOString()
            : null,
      });
      setEditJob(null);
      onRefresh();
      onNotify('success', 'Завдання оновлено');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка оновлення');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRunNow(id: number) {
    try {
      await api.runJobNow(id);
      onRefresh();
      onNotify('success', 'Завдання поставлено на негайне завантаження');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка запуску');
    }
  }

  async function handleRetry(id: number) {
    try {
      await api.retryJob(id);
      onRefresh();
      onNotify('success', 'Повторна спроба додана в чергу');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteJob(id);
      onRefresh();
      onNotify('success', 'Завдання видалено');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Не вдалося видалити');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Черга та Розклад публікацій</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Воркер автоматично перевіряє розклад кожні 5 секунд і виконує завантаження у фоні.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Оновити
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Заплановано', value: stats.scheduled, color: 'text-sky-400' },
          { label: 'У черзі / В процесі', value: stats.active, color: 'text-amber-400' },
          { label: 'Завантажено', value: stats.published, color: 'text-emerald-400' },
          { label: 'Помилки', value: stats.failed, color: 'text-rose-400' },
        ].map((card) => (
          <div key={card.label} className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <div className="text-xs text-slate-400">{card.label}</div>
            <div className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'Усі' },
            { id: 'scheduled', label: 'Заплановані' },
            { id: 'queued', label: 'У черзі' },
            { id: 'published', label: 'Готові' },
            { id: 'failed', label: 'Помилки' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                statusFilter === f.id
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
        >
          <option value="all">Усі канали</option>
          {channels.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Jobs list */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-10 text-center">
          <CalendarClock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <div className="text-sm font-medium text-slate-300">У черзі поки порожньо</div>
          <div className="text-xs text-slate-500 mt-1">
            Перейдіть на вкладку «Завантажити / Запланувати», щоб додати перше відео.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const badge = STATUS_BADGE[job.status];
            const isWorking = job.status === 'uploading' || job.status === 'processing';
            const editable = job.status === 'scheduled' || job.status === 'queued' || job.status === 'failed';

            return (
              <div
                key={job.id}
                className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-4"
              >
                {/* Thumbnail */}
                <div className="w-full lg:w-48 aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 flex items-center justify-center">
                  {job.thumbnailFilename ? (
                    <img
                      src={`/api/media/thumbnail/${encodeURIComponent(job.thumbnailFilename)}`}
                      alt={job.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-slate-600">Без прев’ю</span>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          Канал: <strong className="text-slate-200">{job.channelTitle}</strong>
                          {job.channelIsDemo && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                              Sandbox
                            </span>
                          )}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-white truncate">{job.title}</h3>
                    </div>

                    <div className="text-right text-xs text-slate-400 shrink-0">
                      {job.scheduledFor ? (
                        <div>
                          Вихід: <span className="text-slate-200 font-medium">{formatDateTime(job.scheduledFor)}</span>
                        </div>
                      ) : (
                        <div>Створено: {formatDateTime(job.createdAt)}</div>
                      )}
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Режим:{' '}
                        {job.publishMode === 'youtube_schedule'
                          ? 'YouTube publishAt'
                          : job.publishMode === 'server_schedule'
                            ? 'Серверна черга'
                            : job.publishMode === 'draft_private'
                              ? 'Приватна чернетка'
                              : 'Негайно'}
                      </div>
                    </div>
                  </div>

                  {/* Flag pills */}
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                      {job.madeForKids ? 'Для дітей' : 'Не для дітей'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                      {job.containsSyntheticMedia ? 'Містить AI' : 'Не AI'}
                    </span>
                    {job.hasPaidProductPlacement && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300">Платна реклама</span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                      Сповіщення: {job.notifySubscribers ? 'Так' : 'Ні'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
                      Файл: {job.videoOriginalName}
                    </span>
                  </div>

                  {/* Progress bar when active */}
                  {isWorking && (
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-rose-300 flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {job.status === 'processing' ? 'Обробка / фіналізація на YouTube...' : 'Завантаження...'}
                        </span>
                        <span className="font-semibold text-white">{job.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-500 to-red-500 transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {job.errorMessage && (
                    <div className="rounded-xl bg-rose-950/60 border border-rose-500/30 px-3 py-2 text-xs text-rose-200">
                      {job.errorMessage}
                    </div>
                  )}

                  {job.status === 'published' && job.youtubeVideoId && (
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        ID: {job.youtubeVideoId}
                      </span>
                      {!job.channelIsDemo && (
                        <>
                          <a
                            href={job.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                          >
                            Відкрити на YouTube <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={`https://studio.youtube.com/video/${job.youtubeVideoId}/edit`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-slate-300 hover:underline"
                          >
                            YouTube Studio <ExternalLink className="w-3 h-3" />
                          </a>
                        </>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => setInspectJob(job)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5 text-sky-400" />
                      API Payload & Логи
                    </button>

                    {editable && (
                      <button
                        onClick={() => openEditModal(job)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Редагувати
                      </button>
                    )}

                    {job.status === 'scheduled' && (
                      <button
                        onClick={() => handleRunNow(job.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-xs text-rose-200 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Запустити зараз
                      </button>
                    )}

                    {job.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(job.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs text-emerald-200 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Повторити
                      </button>
                    )}

                    {!isWorking && (
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-rose-950/60 text-xs text-slate-400 hover:text-rose-300 cursor-pointer ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Видалити
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PayloadModal job={inspectJob} onClose={() => setInspectJob(null)} />

      {/* Edit Modal */}
      {editJob && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Редагувати завдання #{editJob.id}</h3>
              <button
                onClick={() => setEditJob(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Заголовок</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Опис</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!editMadeForKids}
                    onChange={(e) => setEditMadeForKids(!e.target.checked)}
                    className="accent-rose-500"
                  />
                  Не для дітей
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!editContainsAi}
                    onChange={(e) => setEditContainsAi(!e.target.checked)}
                    className="accent-rose-500"
                  />
                  Це не AI
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Режим</label>
                  <select
                    value={editPublishMode}
                    onChange={(e) => setEditPublishMode(e.target.value as PublishMode)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="youtube_schedule">YouTube publishAt</option>
                    <option value="server_schedule">Черга на сервері</option>
                    <option value="now">Негайно</option>
                    <option value="draft_private">Приватне</option>
                  </select>
                </div>

                {(editPublishMode === 'youtube_schedule' || editPublishMode === 'server_schedule') && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Дата і час</label>
                    <input
                      type="datetime-local"
                      value={editScheduledLocal}
                      onChange={(e) => setEditScheduledLocal(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditJob(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium text-slate-300 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                disabled={savingEdit}
                onClick={saveEdit}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {savingEdit ? 'Збереження...' : 'Зберегти зміни'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
