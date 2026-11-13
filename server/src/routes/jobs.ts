import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import {
  appendJobLog,
  createJob,
  db,
  deleteJob,
  getAppSettings,
  getChannelById,
  getJobById,
  listJobs,
  updateJobMetadata,
  updateJobState,
  type PublishMode,
} from '../db.js';
import { computeNextScheduleSlot } from '../scheduler.js';
import { getActiveJobId, triggerWorkerTick } from '../worker.js';
import { buildYouTubeInsertPayload } from '../youtube.js';

export const jobsRouter = Router();

function decodeOriginalName(name: string): string {
  if (!name) return 'file';
  if (/[\u0080-\u00FF]/.test(name) && !/[\u0100-\uFFFF]/.test(name)) {
    try {
      const decoded = Buffer.from(name, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD')) return decoded;
    } catch {
      return name;
    }
  }
  return name;
}

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === 'thumbnail') {
      cb(null, config.thumbnailsDir);
    } else {
      cb(null, config.uploadsDir);
    }
  },
  filename: (_req, file, cb) => {
    const decoded = decodeOriginalName(file.originalname);
    const ext = path.extname(decoded).toLowerCase() || (file.fieldname === 'thumbnail' ? '.jpg' : '.mp4');
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10 GB max video
    files: 2,
  },
});

function parseBoolean(val: unknown, fallback: boolean): boolean {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'boolean') return val;
  const str = String(val).toLowerCase().trim();
  if (str === 'true' || str === '1' || str === 'yes' || str === 'on') return true;
  if (str === 'false' || str === '0' || str === 'no' || str === 'off') return false;
  return fallback;
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch {
      // fall through to comma split
    }
  }
  return trimmed
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function cleanupUnreferencedFiles(videoFilename: string, thumbnailFilename: string): void {
  if (videoFilename) {
    const row = db
      .prepare('SELECT COUNT(*) as cnt FROM jobs WHERE video_filename = ?')
      .get(videoFilename) as { cnt: number };
    if (Number(row.cnt) === 0) {
      const vp = path.join(config.uploadsDir, videoFilename);
      if (fs.existsSync(vp)) fs.unlinkSync(vp);
    }
  }
  if (thumbnailFilename) {
    const row = db
      .prepare('SELECT COUNT(*) as cnt FROM jobs WHERE thumbnail_filename = ?')
      .get(thumbnailFilename) as { cnt: number };
    if (Number(row.cnt) === 0) {
      const tp = path.join(config.thumbnailsDir, thumbnailFilename);
      if (fs.existsSync(tp)) fs.unlinkSync(tp);
    }
  }
}

jobsRouter.get('/', (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
  const jobs = listJobs({
    status,
    channelId: channelId && Number.isFinite(channelId) ? channelId : undefined,
  });
  res.json({ jobs, activeJobId: getActiveJobId() });
});

interface ResolvedMediaInput {
  videoFilename: string;
  videoExternalPath: string;
  videoOriginalName: string;
  videoSizeBytes: number;
  videoMimeType: string;
  thumbnailFilename: string;
  thumbnailOriginalName: string;
}

function guessVideoMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.avi') return 'video/x-msvideo';
  return 'video/mp4';
}

function createJobsFromBody(
  body: Record<string, unknown>,
  media: ResolvedMediaInput
): { status: number; error?: string; jobs?: ReturnType<typeof createJob>[] } {
  const title = String(body.title || '').trim();
  if (!title) {
    return { status: 400, error: 'Заголовок (тайтл) відео обов’язковий' };
  }

  let channelIds: number[] = [];
  if (typeof body.channelIds === 'string') {
    try {
      const parsed = JSON.parse(body.channelIds);
      if (Array.isArray(parsed)) channelIds = parsed.map(Number).filter(Number.isFinite);
    } catch {
      channelIds = body.channelIds.split(',').map(Number).filter(Number.isFinite);
    }
  } else if (Array.isArray(body.channelIds)) {
    channelIds = body.channelIds.map(Number).filter(Number.isFinite);
  } else if (body.channelId) {
    const single = Number(body.channelId);
    if (Number.isFinite(single)) channelIds = [single];
  }

  channelIds = [...new Set(channelIds)];
  if (channelIds.length === 0) {
    return { status: 400, error: 'Оберіть хоча б один канал для публікації' };
  }

  const publishModeRaw = String(body.publishMode || 'youtube_schedule');
  const publishMode: PublishMode =
    publishModeRaw === 'now' ||
    publishModeRaw === 'server_schedule' ||
    publishModeRaw === 'draft_private'
      ? publishModeRaw
      : 'youtube_schedule';

  const useAutoSlot = parseBoolean(body.useAutoSlot, false);
  const rawScheduledFor = body.scheduledFor ? String(body.scheduledFor) : null;
  const settings = getAppSettings();

  let playlistMap: Record<string, string> = {};
  if (typeof body.playlistByChannel === 'string' && body.playlistByChannel.trim()) {
    try {
      playlistMap = JSON.parse(body.playlistByChannel) as Record<string, string>;
    } catch {
      playlistMap = {};
    }
  } else if (body.playlistByChannel && typeof body.playlistByChannel === 'object') {
    playlistMap = body.playlistByChannel as Record<string, string>;
  }
  const singlePlaylistId = String(body.playlistId || '');

  const tags = parseTags(body.tags);
  const description = String(body.description || '');
  const categoryId = String(body.categoryId || '22');
  const defaultLanguage = String(body.defaultLanguage || 'uk');
  const defaultAudioLanguage = String(body.defaultAudioLanguage || 'uk');
  const madeForKids = parseBoolean(body.madeForKids, false);
  const containsSyntheticMedia = parseBoolean(body.containsSyntheticMedia, false);
  const hasPaidProductPlacement = parseBoolean(body.hasPaidProductPlacement, false);
  const notifySubscribers = parseBoolean(body.notifySubscribers, true);
  const embeddable = parseBoolean(body.embeddable, true);
  const publicStatsViewable = parseBoolean(body.publicStatsViewable, true);
  const license = body.license === 'creativeCommon' ? 'creativeCommon' : 'youtube';
  const privacyStatus =
    body.privacyStatus === 'unlisted' || body.privacyStatus === 'private' ? body.privacyStatus : 'public';
  const waitForProcessing = parseBoolean(body.waitForProcessing, true);

  const createdJobs = [];
  for (const chId of channelIds) {
    const channel = getChannelById(chId);
    if (!channel) {
      return { status: 404, error: `Канал ID ${chId} не знайдено` };
    }

    let scheduledFor: string | null = null;
    if (publishMode === 'youtube_schedule' || publishMode === 'server_schedule') {
      if (useAutoSlot || !rawScheduledFor) {
        const occupiedRows = db
          .prepare(
            `SELECT scheduled_for FROM jobs
             WHERE channel_id = ? AND scheduled_for IS NOT NULL AND status NOT IN ('cancelled', 'failed')`
          )
          .all(chId) as { scheduled_for: string }[];
        scheduledFor = computeNextScheduleSlot(
          channel.scheduleSlots,
          settings.timezone,
          occupiedRows.map((r) => r.scheduled_for)
        );
      } else {
        const parsedDate = new Date(rawScheduledFor);
        if (Number.isNaN(parsedDate.getTime())) {
          return { status: 400, error: 'Некоректна дата/час запланованої публікації' };
        }
        scheduledFor = parsedDate.toISOString();
      }
    }

    const payload = buildYouTubeInsertPayload({
      title,
      description,
      tags,
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
      scheduledFor,
      waitForProcessing,
    }) as unknown as Record<string, unknown>;

    const job = createJob({
      channelId: chId,
      title,
      description,
      tags,
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
      scheduledFor,
      waitForProcessing,
      playlistId: playlistMap[String(chId)] || singlePlaylistId,
      videoFilename: media.videoFilename,
      videoExternalPath: media.videoExternalPath,
      videoOriginalName: media.videoOriginalName,
      videoSizeBytes: media.videoSizeBytes,
      videoMimeType: media.videoMimeType,
      thumbnailFilename: media.thumbnailFilename,
      thumbnailOriginalName: media.thumbnailOriginalName,
      apiPayload: payload,
    });
    createdJobs.push(job);
  }

  void triggerWorkerTick();
  return { status: 201, jobs: createdJobs };
}

jobsRouter.post('/local', (req, res) => {
  if (!config.isDesktop) {
    res.status(403).json({ error: 'Локальне підключення файлів доступне лише у десктопній програмі' });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const localVideoPath = String(body.localVideoPath || '').trim();
  const localThumbPath = String(body.localThumbPath || '').trim();
  const copyVideo = parseBoolean(body.copyToAppStorage, false);

  if (!localVideoPath || !fs.existsSync(localVideoPath)) {
    res.status(400).json({ error: 'Оберіть існуючий відеофайл на комп’ютері' });
    return;
  }

  let copiedVideoName = '';
  let copiedThumbName = '';

  const cleanupCopied = () => {
    if (copiedVideoName) {
      const vp = path.join(config.uploadsDir, copiedVideoName);
      if (fs.existsSync(vp)) fs.unlinkSync(vp);
    }
    if (copiedThumbName) {
      const tp = path.join(config.thumbnailsDir, copiedThumbName);
      if (fs.existsSync(tp)) fs.unlinkSync(tp);
    }
  };

  try {
    const videoStat = fs.statSync(localVideoPath);
    const videoOriginalName = path.basename(localVideoPath);

    if (copyVideo) {
      const ext = path.extname(videoOriginalName).toLowerCase() || '.mp4';
      copiedVideoName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      fs.copyFileSync(localVideoPath, path.join(config.uploadsDir, copiedVideoName));
    }

    let thumbOriginalName = '';
    if (localThumbPath) {
      if (!fs.existsSync(localThumbPath)) {
        cleanupCopied();
        res.status(400).json({ error: 'Обране прев’ю не знайдено на диску' });
        return;
      }
      const thumbStat = fs.statSync(localThumbPath);
      if (thumbStat.size > 10 * 1024 * 1024) {
        cleanupCopied();
        res.status(400).json({ error: 'Файл прев’ю занадто великий (рекомендовано до 2 MB для YouTube)' });
        return;
      }
      thumbOriginalName = path.basename(localThumbPath);
      const thumbExt = path.extname(thumbOriginalName).toLowerCase() || '.jpg';
      copiedThumbName = `${Date.now()}-${crypto.randomUUID()}${thumbExt}`;
      fs.copyFileSync(localThumbPath, path.join(config.thumbnailsDir, copiedThumbName));
    }

    const result = createJobsFromBody(body, {
      videoFilename: copiedVideoName,
      videoExternalPath: copyVideo ? '' : path.resolve(localVideoPath),
      videoOriginalName,
      videoSizeBytes: videoStat.size,
      videoMimeType: guessVideoMimeType(localVideoPath),
      thumbnailFilename: copiedThumbName,
      thumbnailOriginalName: thumbOriginalName,
    });

    if (result.error) {
      cleanupCopied();
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({ jobs: result.jobs });
  } catch (err) {
    cleanupCopied();
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

jobsRouter.post(
  '/',
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  (req, res) => {
    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const videoFile = files.video?.[0];
    const thumbFile = files.thumbnail?.[0];

    const cleanupOnReject = () => {
      if (videoFile && fs.existsSync(videoFile.path)) fs.unlinkSync(videoFile.path);
      if (thumbFile && fs.existsSync(thumbFile.path)) fs.unlinkSync(thumbFile.path);
    };

    try {
      if (!videoFile) {
        cleanupOnReject();
        res.status(400).json({ error: 'Оберіть відеофайл для завантаження' });
        return;
      }

      if (thumbFile && thumbFile.size > 10 * 1024 * 1024) {
        cleanupOnReject();
        res.status(400).json({ error: 'Файл прев’ю занадто великий (рекомендовано до 2 MB для YouTube)' });
        return;
      }

      const result = createJobsFromBody((req.body || {}) as Record<string, unknown>, {
        videoFilename: videoFile.filename,
        videoExternalPath: '',
        videoOriginalName: decodeOriginalName(videoFile.originalname),
        videoSizeBytes: videoFile.size,
        videoMimeType: videoFile.mimetype || 'video/mp4',
        thumbnailFilename: thumbFile ? thumbFile.filename : '',
        thumbnailOriginalName: thumbFile ? decodeOriginalName(thumbFile.originalname) : '',
      });

      if (result.error) {
        cleanupOnReject();
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json({ jobs: result.jobs });
    } catch (err) {
      cleanupOnReject();
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  }
);

jobsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getJobById(id);
  if (!existing) {
    res.status(404).json({ error: 'Завдання не знайдено' });
    return;
  }
  if (existing.status === 'uploading' || existing.status === 'processing' || existing.status === 'published') {
    res.status(400).json({ error: 'Неможливо редагувати завдання, яке вже завантажується або опубліковане' });
    return;
  }

  const body = req.body || {};
  const nextPublishMode = (body.publishMode as PublishMode) || existing.publishMode;
  const nextScheduledFor =
    body.scheduledFor !== undefined
      ? body.scheduledFor
        ? new Date(String(body.scheduledFor)).toISOString()
        : null
      : existing.scheduledFor;

  const nextStatus =
    nextPublishMode === 'youtube_schedule' || nextPublishMode === 'server_schedule' ? 'scheduled' : 'queued';

  const mergedForPayload = {
    title: body.title !== undefined ? String(body.title) : existing.title,
    description: body.description !== undefined ? String(body.description) : existing.description,
    tags: body.tags !== undefined ? parseTags(body.tags) : existing.tags,
    categoryId: body.categoryId !== undefined ? String(body.categoryId) : existing.categoryId,
    defaultLanguage: existing.defaultLanguage,
    defaultAudioLanguage: existing.defaultAudioLanguage,
    madeForKids: body.madeForKids !== undefined ? Boolean(body.madeForKids) : existing.madeForKids,
    containsSyntheticMedia:
      body.containsSyntheticMedia !== undefined
        ? Boolean(body.containsSyntheticMedia)
        : existing.containsSyntheticMedia,
    hasPaidProductPlacement:
      body.hasPaidProductPlacement !== undefined
        ? Boolean(body.hasPaidProductPlacement)
        : existing.hasPaidProductPlacement,
    notifySubscribers:
      body.notifySubscribers !== undefined ? Boolean(body.notifySubscribers) : existing.notifySubscribers,
    embeddable: body.embeddable !== undefined ? Boolean(body.embeddable) : existing.embeddable,
    publicStatsViewable:
      body.publicStatsViewable !== undefined
        ? Boolean(body.publicStatsViewable)
        : existing.publicStatsViewable,
    license:
      body.license === 'creativeCommon' || body.license === 'youtube' ? body.license : existing.license,
    privacyStatus:
      body.privacyStatus === 'public' ||
      body.privacyStatus === 'unlisted' ||
      body.privacyStatus === 'private'
        ? body.privacyStatus
        : existing.privacyStatus,
    publishMode: nextPublishMode,
    scheduledFor: nextScheduledFor,
    waitForProcessing: existing.waitForProcessing,
  };

  const payload = buildYouTubeInsertPayload(mergedForPayload) as unknown as Record<string, unknown>;
  const updated = updateJobMetadata(id, {
    ...mergedForPayload,
    status: nextStatus,
    apiPayload: payload,
  });

  appendJobLog(id, 'info', 'Параметри завдання оновлено вручну.');
  void triggerWorkerTick();
  res.json({ job: updated });
});

jobsRouter.post('/:id/run-now', (req, res) => {
  const id = Number(req.params.id);
  const job = getJobById(id);
  if (!job) {
    res.status(404).json({ error: 'Завдання не знайдено' });
    return;
  }
  if (job.status === 'uploading' || job.status === 'processing' || job.status === 'published') {
    res.status(400).json({ error: 'Завдання вже виконується або завершене' });
    return;
  }
  updateJobState(id, { status: 'queued', progress: 0, errorMessage: '' });
  appendJobLog(id, 'info', 'Примусовий запуск завантаження поза розкладом.');
  void triggerWorkerTick();
  res.json({ job: getJobById(id) });
});

jobsRouter.post('/:id/retry', (req, res) => {
  const id = Number(req.params.id);
  const job = getJobById(id);
  if (!job) {
    res.status(404).json({ error: 'Завдання не знайдено' });
    return;
  }
  updateJobState(id, { status: 'queued', progress: 0, errorMessage: '' });
  appendJobLog(id, 'info', 'Повторна спроба додана в чергу.');
  void triggerWorkerTick();
  res.json({ job: getJobById(id) });
});

jobsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const job = getJobById(id);
  if (!job) {
    res.status(404).json({ error: 'Завдання не знайдено' });
    return;
  }
  if (job.status === 'uploading' || job.status === 'processing') {
    res.status(400).json({ error: 'Зачекайте завершення поточного завантаження перед видаленням' });
    return;
  }
  deleteJob(id);
  cleanupUnreferencedFiles(job.videoFilename, job.thumbnailFilename);
  res.json({ ok: true });
});
