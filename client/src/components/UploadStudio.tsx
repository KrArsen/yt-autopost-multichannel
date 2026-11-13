import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../api';
import { YOUTUBE_CATEGORIES, YOUTUBE_LANGUAGES } from '../constants/youtube';
import type { ChannelRecord, PresetRecord, PublishMode } from '../types';

interface UploadStudioProps {
  channels: ChannelRecord[];
  presets: PresetRecord[];
  onCreatedJobs: () => void;
  onPresetCreated: () => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
  onGoToChannels: () => void;
}

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleDateInput(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return toLocalDatetimeInputValue(d);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function UploadStudio({
  channels,
  presets,
  onCreatedJobs,
  onPresetCreated,
  onNotify,
  onGoToChannels,
}: UploadStudioProps) {
  const activeChannels = useMemo(() => channels.filter((c) => c.isActive), [channels]);

  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [playlistByChannel, setPlaylistByChannel] = useState<Record<string, string>>({});

  const isDesktop = Boolean(window.electronDesktop?.isDesktop);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [localVideo, setLocalVideo] = useState<{ path: string; name: string; size: number } | null>(null);
  const [copyToAppStorage, setCopyToAppStorage] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [localThumb, setLocalThumb] = useState<{ path: string; name: string; size: number } | null>(null);
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState<string>('');
  const [videoDragActive, setVideoDragActive] = useState(false);
  const [thumbDragActive, setThumbDragActive] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [categoryId, setCategoryId] = useState('22');
  const [defaultLanguage, setDefaultLanguage] = useState('uk');
  const [defaultAudioLanguage, setDefaultAudioLanguage] = useState('uk');

  // Checkboxes — defaulted to "Not for kids" + "Not AI" + best practices
  const [madeForKids, setMadeForKids] = useState(false);
  const [containsSyntheticMedia, setContainsSyntheticMedia] = useState(false);
  const [hasPaidProductPlacement, setHasPaidProductPlacement] = useState(false);
  const [notifySubscribers, setNotifySubscribers] = useState(true);
  const [embeddable, setEmbeddable] = useState(true);
  const [publicStatsViewable, setPublicStatsViewable] = useState(true);
  const [license, setLicense] = useState<'youtube' | 'creativeCommon'>('youtube');
  const [waitForProcessing, setWaitForProcessing] = useState(true);

  // Schedule
  const [publishMode, setPublishMode] = useState<PublishMode>('youtube_schedule');
  const [privacyStatus, setPrivacyStatus] = useState<'public' | 'unlisted' | 'private'>('public');
  const [scheduledLocal, setScheduledLocal] = useState<string>(defaultScheduleDateInput);
  const [useAutoSlot, setUseAutoSlot] = useState(false);

  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [savingPreset, setSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  // Initialize default channel & preset once
  useEffect(() => {
    if (initializedRef.current) return;
    if (activeChannels.length > 0) {
      const first = activeChannels[0];
      setSelectedChannelIds([first.id]);
      const presetId = first.defaultPresetId ?? presets[0]?.id;
      if (presetId) {
        const found = presets.find((p) => p.id === presetId);
        if (found) applyPreset(found);
      }
      initializedRef.current = true;
    } else if (presets.length > 0) {
      applyPreset(presets[0]);
      initializedRef.current = true;
    }
  }, [activeChannels, presets]);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    };
  }, [videoPreviewUrl, thumbPreviewUrl]);

  function applyPreset(preset: PresetRecord, appendFooter = false) {
    setSelectedPresetId(String(preset.id));
    setCategoryId(preset.categoryId);
    setDefaultLanguage(preset.defaultLanguage);
    setDefaultAudioLanguage(preset.defaultAudioLanguage);
    setMadeForKids(preset.madeForKids);
    setContainsSyntheticMedia(preset.containsSyntheticMedia);
    setHasPaidProductPlacement(preset.hasPaidProductPlacement);
    setNotifySubscribers(preset.notifySubscribers);
    setEmbeddable(preset.embeddable);
    setPublicStatsViewable(preset.publicStatsViewable);
    setLicense(preset.license);
    setPrivacyStatus(preset.defaultPrivacy);
    setWaitForProcessing(preset.waitForProcessing);
    if (preset.defaultTags.length > 0) {
      setTagsText(preset.defaultTags.join(', '));
    }
    if (appendFooter && preset.descriptionFooter.trim()) {
      setDescription((prev) =>
        prev.includes(preset.descriptionFooter.trim()) ? prev : `${prev}${preset.descriptionFooter}`
      );
    }
  }

  function handleChannelToggle(channel: ChannelRecord) {
    setSelectedChannelIds((prev) => {
      const exists = prev.includes(channel.id);
      const next = exists ? prev.filter((id) => id !== channel.id) : [...prev, channel.id];
      // Auto-apply channel's default preset when picking the first channel
      if (!exists && prev.length === 0 && channel.defaultPresetId) {
        const preset = presets.find((p) => p.id === channel.defaultPresetId);
        if (preset) applyPreset(preset);
      }
      return next;
    });
  }

  function revokeBlobUrl(url: string) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  function applyDefaultTitleFromFilename(fileName: string) {
    if (!title.trim()) {
      const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setTitle(base.slice(0, 100));
    }
  }

  function handleVideoSelect(file: File | null) {
    if (!file) return;
    revokeBlobUrl(videoPreviewUrl);
    const localPath = isDesktop ? window.electronDesktop?.getFilePath(file) || '' : '';
    if (localPath) {
      setLocalVideo({ path: localPath, name: file.name, size: file.size });
      setVideoFile(null);
      setVideoPreviewUrl(`/api/media/local-file?path=${encodeURIComponent(localPath)}`);
    } else {
      setLocalVideo(null);
      setVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
    }
    applyDefaultTitleFromFilename(file.name);
  }

  async function handlePickDesktopVideo() {
    if (!window.electronDesktop) return;
    const picked = await window.electronDesktop.pickVideoFile();
    if (!picked) return;
    revokeBlobUrl(videoPreviewUrl);
    setLocalVideo(picked);
    setVideoFile(null);
    setVideoPreviewUrl(`/api/media/local-file?path=${encodeURIComponent(picked.path)}`);
    applyDefaultTitleFromFilename(picked.name);
  }

  function handleThumbSelect(file: File | null) {
    if (!file) return;
    revokeBlobUrl(thumbPreviewUrl);
    const localPath = isDesktop ? window.electronDesktop?.getFilePath(file) || '' : '';
    if (localPath) {
      setLocalThumb({ path: localPath, name: file.name, size: file.size });
      setThumbFile(null);
      setThumbPreviewUrl(`/api/media/local-file?path=${encodeURIComponent(localPath)}`);
    } else {
      setLocalThumb(null);
      setThumbFile(file);
      setThumbPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function handlePickDesktopThumb() {
    if (!window.electronDesktop) return;
    const picked = await window.electronDesktop.pickThumbnailFile();
    if (!picked) return;
    revokeBlobUrl(thumbPreviewUrl);
    setLocalThumb(picked);
    setThumbFile(null);
    setThumbPreviewUrl(`/api/media/local-file?path=${encodeURIComponent(picked.path)}`);
  }

  async function handleFillNextSlot() {
    if (selectedChannelIds.length === 0) {
      onNotify('error', 'Спочатку оберіть канал, щоб розрахувати його найближчий слот');
      return;
    }
    try {
      const { nextSlotIso } = await api.getNextChannelSlot(selectedChannelIds[0]);
      setScheduledLocal(toLocalDatetimeInputValue(new Date(nextSlotIso)));
      setUseAutoSlot(false);
      if (publishMode === 'now' || publishMode === 'draft_private') {
        setPublishMode('youtube_schedule');
      }
      onNotify('success', 'Підставлено найближчий вільний слот з розкладу каналу');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Не вдалося розрахувати слот');
    }
  }

  async function handleSaveCurrentAsPreset() {
    if (!newPresetName.trim()) {
      onNotify('error', 'Введіть назву для пресету');
      return;
    }
    setSavingPreset(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const { preset } = await api.createPreset({
        name: newPresetName.trim(),
        descriptionFooter: '',
        defaultTags: tags,
        categoryId,
        defaultLanguage,
        defaultAudioLanguage,
        madeForKids,
        containsSyntheticMedia,
        hasPaidProductPlacement,
        notifySubscribers,
        embeddable,
        publicStatsViewable,
        license,
        defaultPrivacy: privacyStatus,
        waitForProcessing,
      });
      setSelectedPresetId(String(preset.id));
      setNewPresetName('');
      setShowSavePresetInput(false);
      onPresetCreated();
      onNotify('success', `Пресет «${preset.name}» збережено!`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка збереження пресету');
    } finally {
      setSavingPreset(false);
    }
  }

  const parsedTags = useMemo(
    () =>
      tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText]
  );

  const livePayloadPreview = useMemo(() => {
    const isScheduled = publishMode === 'youtube_schedule' || publishMode === 'server_schedule';
    const schedIso = isScheduled && scheduledLocal ? new Date(scheduledLocal).toISOString() : undefined;
    return {
      part: ['snippet', 'status', 'paidProductPlacementDetails'],
      notifySubscribers,
      requestBody: {
        snippet: {
          title: title.trim() || '(назва відео)',
          description,
          ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
          categoryId,
          defaultLanguage,
          defaultAudioLanguage,
        },
        status: {
          privacyStatus:
            publishMode === 'youtube_schedule' || publishMode === 'draft_private'
              ? 'private'
              : waitForProcessing && privacyStatus !== 'private'
                ? 'private (перемкнеться після обробки HD)'
                : privacyStatus,
          ...(publishMode === 'youtube_schedule' && schedIso ? { publishAt: schedIso } : {}),
          selfDeclaredMadeForKids: madeForKids,
          containsSyntheticMedia,
          embeddable,
          publicStatsViewable,
          license,
        },
        paidProductPlacementDetails: {
          hasPaidProductPlacement,
        },
      },
      thumbnail:
        localThumb || thumbFile
          ? `${(localThumb || thumbFile)!.name} (${formatBytes((localThumb || thumbFile)!.size)})`
          : null,
    };
  }, [
    publishMode,
    scheduledLocal,
    notifySubscribers,
    title,
    description,
    parsedTags,
    categoryId,
    defaultLanguage,
    defaultAudioLanguage,
    waitForProcessing,
    privacyStatus,
    madeForKids,
    containsSyntheticMedia,
    embeddable,
    publicStatsViewable,
    license,
    hasPaidProductPlacement,
    thumbFile,
    localThumb,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!localVideo && !videoFile) {
      onNotify('error', 'Додайте відеофайл перед відправкою');
      return;
    }
    if (selectedChannelIds.length === 0) {
      onNotify('error', 'Оберіть хоча б один канал');
      return;
    }
    if (!title.trim()) {
      onNotify('error', 'Введіть заголовок відео');
      return;
    }

    const isScheduled = publishMode === 'youtube_schedule' || publishMode === 'server_schedule';
    let scheduledForIso = '';
    if (isScheduled && !useAutoSlot) {
      if (!scheduledLocal) {
        onNotify('error', 'Оберіть дату та час публікації');
        return;
      }
      const parsed = new Date(scheduledLocal);
      if (Number.isNaN(parsed.getTime())) {
        onNotify('error', 'Некоректний формат дати');
        return;
      }
      if (parsed.getTime() < Date.now() + 2 * 60 * 1000) {
        onNotify('error', 'Час запланованої публікації має бути хоча б на 2 хвилини у майбутньому');
        return;
      }
      scheduledForIso = parsed.toISOString();
    }

    setSubmitting(true);
    setUploadPercent(0);
    try {
      const res = localVideo
        ? await api.createLocalJobs({
            localVideoPath: localVideo.path,
            localThumbPath: localThumb?.path || undefined,
            copyToAppStorage,
            channelIds: selectedChannelIds,
            playlistByChannel,
            title: title.trim(),
            description,
            tags: parsedTags,
            categoryId,
            defaultLanguage,
            defaultAudioLanguage,
            madeForKids,
            containsSyntheticMedia,
            hasPaidProductPlacement,
            notifySubscribers,
            embeddable,
            publicStatsViewable,
            license,
            privacyStatus,
            publishMode,
            useAutoSlot,
            scheduledFor: scheduledForIso || undefined,
            waitForProcessing,
          })
        : await (() => {
            if (!videoFile) {
              throw new Error('Додайте відеофайл перед відправкою');
            }
            const formData = new FormData();
            formData.append('video', videoFile);
            if (thumbFile) {
              formData.append('thumbnail', thumbFile);
            }
            formData.append('channelIds', JSON.stringify(selectedChannelIds));
            formData.append('playlistByChannel', JSON.stringify(playlistByChannel));
            formData.append('title', title.trim());
            formData.append('description', description);
            formData.append('tags', JSON.stringify(parsedTags));
            formData.append('categoryId', categoryId);
            formData.append('defaultLanguage', defaultLanguage);
            formData.append('defaultAudioLanguage', defaultAudioLanguage);
            formData.append('madeForKids', String(madeForKids));
            formData.append('containsSyntheticMedia', String(containsSyntheticMedia));
            formData.append('hasPaidProductPlacement', String(hasPaidProductPlacement));
            formData.append('notifySubscribers', String(notifySubscribers));
            formData.append('embeddable', String(embeddable));
            formData.append('publicStatsViewable', String(publicStatsViewable));
            formData.append('license', license);
            formData.append('privacyStatus', privacyStatus);
            formData.append('publishMode', publishMode);
            formData.append('useAutoSlot', String(useAutoSlot));
            if (scheduledForIso) formData.append('scheduledFor', scheduledForIso);
            formData.append('waitForProcessing', String(waitForProcessing));
            return api.createJobsWithProgress(formData, setUploadPercent);
          })();
      onNotify(
        'success',
        `Успішно додано ${res.jobs.length} ${res.jobs.length === 1 ? 'завдання' : 'завдань'} у чергу автопостингу!`
      );
      setLocalVideo(null);
      setVideoFile(null);
      revokeBlobUrl(videoPreviewUrl);
      setVideoPreviewUrl('');
      setLocalThumb(null);
      setThumbFile(null);
      revokeBlobUrl(thumbPreviewUrl);
      setThumbPreviewUrl('');
      setCopyToAppStorage(false);
      setTitle('');
      onCreatedJobs();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка створення завдання');
    } finally {
      setSubmitting(false);
      setUploadPercent(0);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Студія автопостингу</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Оберіть канали, налаштуйте прев’ю, опис, галочки та час автоматичної публікації.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedPresetId}
            onChange={(e) => {
              const found = presets.find((p) => String(p.id) === e.target.value);
              if (found) applyPreset(found, true);
            }}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-rose-500"
          >
            <option value="">Застосувати пресет...</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                Пресет: {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowSavePresetInput((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-colors cursor-pointer"
            title="Зберегти поточні галочки як пресет"
          >
            <BookmarkPlus className="w-4 h-4 text-rose-400" />
            <span className="hidden sm:inline">Зберегти пресет</span>
          </button>
        </div>
      </div>

      {showSavePresetInput && (
        <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Назва пресету (напр. Мій шаблон без AI)"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingPreset}
              onClick={handleSaveCurrentAsPreset}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {savingPreset ? 'Збереження...' : 'Зберегти'}
            </button>
            <button
              type="button"
              onClick={() => setShowSavePresetInput(false)}
              className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm cursor-pointer"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Channels */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            1. Куди заливати (канали YouTube)
          </h2>
          <button
            type="button"
            onClick={onGoToChannels}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
          >
            + Підключити ще канал
          </button>
        </div>

        {activeChannels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center">
            <p className="text-sm text-slate-400 mb-3">Немає активних підключених каналів.</p>
            <button
              type="button"
              onClick={onGoToChannels}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold cursor-pointer"
            >
              Перейти до підключення каналів
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeChannels.map((ch) => {
              const selected = selectedChannelIds.includes(ch.id);
              return (
                <div
                  key={ch.id}
                  onClick={() => handleChannelToggle(ch)}
                  className={`rounded-xl border p-3.5 transition-all cursor-pointer select-none ${
                    selected
                      ? 'bg-rose-500/10 border-rose-500/60 shadow-sm shadow-rose-950/30'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {ch.avatarUrl ? (
                      <img
                        src={ch.avatarUrl}
                        alt={ch.title}
                        className="w-10 h-10 rounded-full object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-sm text-rose-300 border border-slate-700">
                        {ch.title.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-white truncate">{ch.title}</span>
                        {ch.isDemo && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Sandbox
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {ch.handle || ch.googleEmail || ch.youtubeChannelId}
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                        selected
                          ? 'bg-rose-500 border-rose-400 text-white'
                          : 'border-slate-600 bg-slate-900'
                      }`}
                    >
                      {selected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  {selected && ch.playlists.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={playlistByChannel[String(ch.id)] || ''}
                        onChange={(e) =>
                          setPlaylistByChannel((prev) => ({ ...prev, [String(ch.id)]: e.target.value }))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                      >
                        <option value="">Без додавання в плейлист</option>
                        {ch.playlists.map((pl) => (
                          <option key={pl.id} value={pl.id}>
                            Плейлист: {pl.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selectedChannelIds.length > 1 && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Обрано кілька каналів ({selectedChannelIds.length}). Пам’ятайте про правила YouTube: масове
              завантаження абсолютно однакових роликів на різні канали одночасно може розцінюватися як спам або
              понижувати охоплення.
            </span>
          </div>
        )}
      </section>

      {/* Step 2: Media Files */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Video dropzone */}
        <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3">
            2. Відеофайл
          </h2>

          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handleVideoSelect(e.target.files?.[0] || null)}
          />

          {!localVideo && !videoFile ? (
            <div
              onClick={() => (isDesktop ? void handlePickDesktopVideo() : videoInputRef.current?.click())}
              onDragOver={(e) => {
                e.preventDefault();
                setVideoDragActive(true);
              }}
              onDragLeave={() => setVideoDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setVideoDragActive(false);
                handleVideoSelect(e.dataTransfer.files?.[0] || null);
              }}
              className={`flex-1 min-h-52 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center transition-colors cursor-pointer ${
                videoDragActive
                  ? 'border-rose-500 bg-rose-500/10'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-950/50'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-3">
                {isDesktop ? (
                  <FolderOpen className="w-6 h-6 text-rose-400" />
                ) : (
                  <Film className="w-6 h-6 text-rose-400" />
                )}
              </div>
              <div className="text-sm font-semibold text-white">
                {isDesktop
                  ? 'Оберіть відео на комп’ютері або перетягніть сюди'
                  : 'Перетягніть відео сюди або натисніть для вибору'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {isDesktop
                  ? 'MP4, MOV, MKV, WebM — підключається напряму з диска без дублювання'
                  : 'MP4, MOV, MKV, WebM — звичайні відео або Shorts'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video max-h-64 flex items-center justify-center">
                <video src={videoPreviewUrl} controls className="w-full h-full object-contain" />
              </div>
              <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {localVideo?.name || videoFile?.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatBytes(localVideo?.size ?? videoFile?.size ?? 0)}
                    {localVideo && (
                      <span className="ml-2 text-emerald-400">• напряму з диска</span>
                    )}
                  </div>
                  {localVideo && (
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{localVideo.path}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLocalVideo(null);
                    setVideoFile(null);
                    revokeBlobUrl(videoPreviewUrl);
                    setVideoPreviewUrl('');
                    setCopyToAppStorage(false);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {localVideo && (
                <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyToAppStorage}
                    onChange={(e) => setCopyToAppStorage(e.target.checked)}
                    className="rounded border-slate-600 accent-rose-500"
                  />
                  <span>
                    Скопіювати відео у сховище програми (корисно, якщо ви плануєте перемістити чи видалити оригінал до
                    публікації)
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Thumbnail dropzone */}
        <div className="lg:col-span-5 bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              3. Прев’ю (Thumbnail)
            </h2>
            <span className="text-[11px] text-slate-400">JPG / PNG, до 2 MB</span>
          </div>

          <input
            ref={thumbInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleThumbSelect(e.target.files?.[0] || null)}
          />

          {!localThumb && !thumbFile ? (
            <div
              onClick={() => (isDesktop ? void handlePickDesktopThumb() : thumbInputRef.current?.click())}
              onDragOver={(e) => {
                e.preventDefault();
                setThumbDragActive(true);
              }}
              onDragLeave={() => setThumbDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setThumbDragActive(false);
                handleThumbSelect(e.dataTransfer.files?.[0] || null);
              }}
              className={`flex-1 min-h-52 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center transition-colors cursor-pointer ${
                thumbDragActive
                  ? 'border-rose-500 bg-rose-500/10'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-950/50'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-3">
                <ImageIcon className="w-6 h-6 text-sky-400" />
              </div>
              <div className="text-sm font-semibold text-white">Завантажити обкладинку (16:9)</div>
              <div className="text-xs text-slate-400 mt-1">1280×720 або 1920×1080</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video">
                <img src={thumbPreviewUrl} alt="Прев’ю" className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {localThumb?.name || thumbFile?.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatBytes(localThumb?.size ?? thumbFile?.size ?? 0)}
                    {(localThumb?.size ?? thumbFile?.size ?? 0) > 2 * 1024 * 1024 && (
                      <span className="text-amber-400 ml-2">(Понад 2 MB — YouTube може відхилити)</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLocalThumb(null);
                    setThumbFile(null);
                    revokeBlobUrl(thumbPreviewUrl);
                    setThumbPreviewUrl('');
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Step 3: Metadata */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          4. Метадані: Тайтл, Опис, Теги, Категорія
        </h2>

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <label className="font-medium text-slate-300">Заголовок відео (Title) *</label>
            <span className={title.length > 95 ? 'text-amber-400' : 'text-slate-500'}>
              {title.length} / 100
            </span>
          </div>
          <input
            type="text"
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Наприклад: Як працює автоматизація YouTube у 2026"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500"
          />
        </div>

        <div>
          <div className="flex justify-between items-center text-xs mb-1.5">
            <label className="font-medium text-slate-300">Опис (Description)</label>
            <div className="flex items-center gap-3">
              {selectedPresetId && (
                <button
                  type="button"
                  onClick={() => {
                    const p = presets.find((x) => String(x.id) === selectedPresetId);
                    if (p?.descriptionFooter.trim()) {
                      setDescription((prev) =>
                        prev.includes(p.descriptionFooter.trim()) ? prev : `${prev}${p.descriptionFooter}`
                      );
                    }
                  }}
                  className="text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
                >
                  + Вставити футер з пресету
                </button>
              )}
              <span className="text-slate-500">{description.length} / 5000</span>
            </div>
          </div>
          <textarea
            rows={5}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опис відео, таймкоди, посилання..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500 resize-y"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Теги (через кому)
            </label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="youtube, влог, огляд"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              Тегів: {parsedTags.length} • символів: {tagsText.length}/500
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Категорія YouTube</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
            >
              {YOUTUBE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Мова відео</label>
              <select
                value={defaultAudioLanguage}
                onChange={(e) => setDefaultAudioLanguage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
              >
                {YOUTUBE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Мова опису</label>
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
              >
                {YOUTUBE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Step 4: Checkboxes (Crucial requirement!) */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              5. Обов’язкові галочки YouTube Studio (проставляються автоматично)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ці прапорці передаються напряму в YouTube Data API v3 (<code>status</code> та{' '}
              <code>paidProductPlacementDetails</code>).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Made for kids */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 space-y-2.5">
            <div className="text-xs font-semibold text-slate-300">
              Аудиторія (<code className="text-slate-400">selfDeclaredMadeForKids</code>)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMadeForKids(false)}
                className={`px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  !madeForKids
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${!madeForKids ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span>Ні, не для дітей</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMadeForKids(true)}
                className={`px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  madeForKids
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${madeForKids ? 'text-amber-400' : 'text-slate-600'}`} />
                  <span>Так, для дітей</span>
                </div>
              </button>
            </div>
          </div>

          {/* Synthetic / AI Media */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 space-y-2.5">
            <div className="text-xs font-semibold text-slate-300">
              Змінений / AI контент (<code className="text-slate-400">containsSyntheticMedia</code>)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setContainsSyntheticMedia(false)}
                className={`px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  !containsSyntheticMedia
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    className={`w-4 h-4 ${!containsSyntheticMedia ? 'text-emerald-400' : 'text-slate-600'}`}
                  />
                  <span>Ні, це не AI-контент</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setContainsSyntheticMedia(true)}
                className={`px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  containsSyntheticMedia
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles
                    className={`w-4 h-4 ${containsSyntheticMedia ? 'text-sky-400' : 'text-slate-600'}`}
                  />
                  <span>Так, містить AI / синтетику</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Standard checkboxes grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="flex items-start gap-3 rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 cursor-pointer hover:border-slate-700">
            <input
              type="checkbox"
              checked={hasPaidProductPlacement}
              onChange={(e) => setHasPaidProductPlacement(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-rose-500 rounded"
            />
            <div>
              <div className="text-sm font-medium text-white">Платна реклама / спонсорство</div>
              <div className="text-xs text-slate-400">
                <code>hasPaidProductPlacement</code>
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 cursor-pointer hover:border-slate-700">
            <input
              type="checkbox"
              checked={notifySubscribers}
              onChange={(e) => setNotifySubscribers(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-rose-500 rounded"
            />
            <div>
              <div className="text-sm font-medium text-white">Сповістити підписників</div>
              <div className="text-xs text-slate-400">
                <code>notifySubscribers</code> при публікації
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 cursor-pointer hover:border-slate-700">
            <input
              type="checkbox"
              checked={embeddable}
              onChange={(e) => setEmbeddable(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-rose-500 rounded"
            />
            <div>
              <div className="text-sm font-medium text-white">Дозволити вбудовування</div>
              <div className="text-xs text-slate-400">Показ плеєра на сторонніх сайтах</div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 cursor-pointer hover:border-slate-700">
            <input
              type="checkbox"
              checked={publicStatsViewable}
              onChange={(e) => setPublicStatsViewable(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-rose-500 rounded"
            />
            <div>
              <div className="text-sm font-medium text-white">Публічна статистика</div>
              <div className="text-xs text-slate-400">Показувати перегляди та оцінки</div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 cursor-pointer hover:border-slate-700">
            <input
              type="checkbox"
              checked={waitForProcessing}
              onChange={(e) => setWaitForProcessing(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-rose-500 rounded"
            />
            <div>
              <div className="text-sm font-medium text-white">Чекати обробки HD перед Public</div>
              <div className="text-xs text-slate-400">Захист стартового утримання</div>
            </div>
          </label>

          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5">
            <label className="block text-xs font-medium text-slate-400 mb-1">Ліцензія YouTube</label>
            <select
              value={license}
              onChange={(e) => setLicense(e.target.value as 'youtube' | 'creativeCommon')}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
            >
              <option value="youtube">Стандартна ліцензія YouTube</option>
              <option value="creativeCommon">Creative Commons (CC BY)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Step 5: Scheduling */}
      <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-rose-400" />
          6. Режим публікації та розклад
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            {
              id: 'youtube_schedule' as PublishMode,
              title: 'Відкладена на YouTube (publishAt)',
              desc: 'Заливається заздалегідь як приватне, YouTube обробить HD та відкриє точно в час X.',
            },
            {
              id: 'server_schedule' as PublishMode,
              title: 'Черга на нашому сервері',
              desc: 'Відео лежить на сервері і почне завантаження на YouTube у вказану дату/час.',
            },
            {
              id: 'now' as PublishMode,
              title: 'Опублікувати зараз',
              desc: 'Негайне завантаження в чергу воркера з обраним статусом доступу.',
            },
            {
              id: 'draft_private' as PublishMode,
              title: 'Залити як Приватне (Чернетка)',
              desc: 'Заливає одразу на YouTube у закритий доступ без публікації.',
            },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setPublishMode(mode.id)}
              className={`rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                publishMode === mode.id
                  ? 'bg-rose-500/10 border-rose-500/60 text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-sm">{mode.title}</div>
              <div className="text-xs text-slate-400 mt-1 leading-relaxed">{mode.desc}</div>
            </button>
          ))}
        </div>

        {(publishMode === 'youtube_schedule' || publishMode === 'server_schedule') && (
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Дата та час публікації
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="datetime-local"
                  disabled={useAutoSlot}
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white disabled:opacity-40 focus:outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  onClick={handleFillNextSlot}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-rose-400" />
                  Підставити наступний слот каналу
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useAutoSlot}
                onChange={(e) => setUseAutoSlot(e.target.checked)}
                className="w-4 h-4 accent-rose-500 rounded"
              />
              <span>Авто-слот індивідуально для кожного каналу</span>
            </label>
          </div>
        )}

        {(publishMode === 'now' || publishMode === 'server_schedule') && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-xs font-medium text-slate-400">Кінцевий статус доступу:</span>
            {(['public', 'unlisted', 'private'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrivacyStatus(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                  privacyStatus === p
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                {p === 'public'
                  ? 'Відкритий (Public)'
                  : p === 'unlisted'
                    ? 'За посиланням (Unlisted)'
                    : 'Приватний (Private)'}
              </button>
            ))}
          </div>
        )}

        {publishMode === 'youtube_schedule' && (
          <div className="flex items-start gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <span>
              Для YouTube <code>publishAt</code> відео спершу завантажується як <code>private</code>, проходить
              перевірки HD та авторських прав, а рівно в обраний час стає <code>public</code>.
            </span>
          </div>
        )}
      </section>

      {/* Footer Submit + API JSON toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <button
          type="button"
          onClick={() => setShowJsonPreview((v) => !v)}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <Code2 className="w-4 h-4 text-rose-400" />
          {showJsonPreview ? 'Сховати прев’ю JSON для YouTube API' : 'Перевірити JSON, який піде в YouTube API'}
        </button>

        <button
          type="submit"
          disabled={submitting || activeChannels.length === 0}
          className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold text-sm shadow-lg shadow-rose-950/50 transition-all disabled:opacity-50 cursor-pointer"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {localVideo ? 'Додавання у чергу...' : `Передача на сервер: ${uploadPercent}%`}
            </>
          ) : publishMode === 'now' ? (
            <>
              <Upload className="w-4 h-4" />
              Завантажити зараз
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Додати в розклад / чергу
            </>
          )}
        </button>
      </div>

      {showJsonPreview && (
        <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-emerald-300 overflow-x-auto">
          {JSON.stringify(livePayloadPreview, null, 2)}
        </pre>
      )}
    </form>
  );
}
