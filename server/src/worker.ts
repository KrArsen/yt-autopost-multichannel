import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import {
  appendJobLog,
  db,
  getAppSettings,
  getChannelById,
  getJobById,
  getTodayQuotaSummary,
  recordQuotaEvent,
  resetInterruptedJobs,
  updateJobState,
  type JobRecord,
} from './db.js';
import { buildYouTubeInsertPayload, uploadVideoToYouTube } from './youtube.js';

let activeJobId: number | null = null;
let workerTimer: NodeJS.Timeout | null = null;
let isTickRunning = false;

function findNextDueJob(): JobRecord | null {
  const settings = getAppSettings();
  const nowMs = Date.now();
  const preUploadLeadMs = settings.preUploadLeadMinutes * 60 * 1000;

  // 1. Any immediately queued job
  const queuedRow = db
    .prepare(
      `SELECT id FROM jobs
       WHERE status = 'queued'
       ORDER BY id ASC
       LIMIT 1`
    )
    .get() as { id: number } | undefined;
  if (queuedRow) return getJobById(queuedRow.id);

  // 2. Any scheduled job whose trigger time has arrived
  const scheduledRows = db
    .prepare(
      `SELECT id, publish_mode, scheduled_for
       FROM jobs
       WHERE status = 'scheduled'
       ORDER BY COALESCE(scheduled_for, created_at) ASC, id ASC`
    )
    .all() as { id: number; publish_mode: string; scheduled_for: string | null }[];

  for (const row of scheduledRows) {
    if (!row.scheduled_for) {
      return getJobById(row.id);
    }
    const targetMs = new Date(row.scheduled_for).getTime();
    if (!Number.isFinite(targetMs)) continue;

    if (row.publish_mode === 'youtube_schedule') {
      // Pre-upload ahead of time (lead minutes, or immediately if within lead window)
      if (nowMs >= targetMs - preUploadLeadMs) {
        return getJobById(row.id);
      }
    } else {
      // server_schedule: wait until the exact scheduled time
      if (nowMs >= targetMs) {
        return getJobById(row.id);
      }
    }
  }

  return null;
}

async function runDemoUpload(job: JobRecord): Promise<void> {
  const payload = buildYouTubeInsertPayload(job) as unknown as Record<string, unknown>;
  updateJobState(job.id, { status: 'uploading', progress: 5, apiPayload: payload });
  appendJobLog(job.id, 'info', '[Sandbox] Симуляція завантаження відео у YouTube Data API v3...');

  for (const pct of [18, 36, 58, 79, 92]) {
    const fresh = getJobById(job.id);
    if (!fresh || fresh.status === 'cancelled') return;
    await new Promise((r) => setTimeout(r, 350));
    updateJobState(job.id, { progress: pct });
  }

  updateJobState(job.id, { status: 'processing', progress: 96 });
  appendJobLog(
    job.id,
    'info',
    job.thumbnailFilename
      ? '[Sandbox] Симуляція thumbnails.set (прев’ю прикріплено).'
      : '[Sandbox] Прев’ю не вказано, використано стандартний кадр.'
  );
  await new Promise((r) => setTimeout(r, 350));

  const fakeId = `DEMO_${job.id}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const fakeUrl = `https://www.youtube.com/watch?v=${fakeId}`;

  recordQuotaEvent({
    channelId: job.channelId,
    jobId: job.id,
    endpoint: 'videos.insert',
    units: 1,
    isDemo: true,
  });

  updateJobState(job.id, {
    status: 'published',
    progress: 100,
    youtubeVideoId: fakeId,
    youtubeUrl: fakeUrl,
    completedAt: new Date().toISOString(),
    errorMessage: '',
    apiPayload: payload as unknown as Record<string, unknown>,
  });
  appendJobLog(job.id, 'info', `[Sandbox] Готово! Сформовано демо-публікацію (${fakeId}). Реальна квота Google не витрачалась.`);
}

async function processJob(job: JobRecord): Promise<void> {
  activeJobId = job.id;
  try {
    const channel = getChannelById(job.channelId);
    if (!channel) {
      throw new Error('Канал більше не існує');
    }
    if (!channel.isActive) {
      throw new Error(`Канал "${channel.title}" вимкнено в налаштуваннях`);
    }

    const videoPath = job.videoExternalPath
      ? job.videoExternalPath
      : path.join(config.uploadsDir, job.videoFilename);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Файл відео не знайдено на диску: ${job.videoOriginalName}`);
    }

    const thumbnailPath = job.thumbnailFilename ? path.join(config.thumbnailsDir, job.thumbnailFilename) : null;

    if (channel.isDemo) {
      await runDemoUpload(job);
      return;
    }

    const quota = getTodayQuotaSummary();
    if (quota.liveUploadsUsed >= quota.liveUploadsLimit) {
      throw new Error(
        `Досягнуто денний ліміт квоти YouTube API (${quota.liveUploadsUsed}/${quota.liveUploadsLimit} завантажень за дату ${quota.ptDate} PT). Спробуйте після скидання о 00:00 PT.`
      );
    }

    const payloadPreview = buildYouTubeInsertPayload(job);
    updateJobState(job.id, {
      status: 'uploading',
      progress: 1,
      errorMessage: '',
      apiPayload: payloadPreview as unknown as Record<string, unknown>,
    });

    const result = await uploadVideoToYouTube(
      job,
      videoPath,
      thumbnailPath,
      (percent) => {
        const nextStatus = percent >= 94 && job.waitForProcessing ? 'processing' : 'uploading';
        updateJobState(job.id, { status: nextStatus, progress: percent });
      },
      (level, message) => appendJobLog(job.id, level, message)
    );

    recordQuotaEvent({
      channelId: job.channelId,
      jobId: job.id,
      endpoint: 'videos.insert',
      units: 1,
      isDemo: false,
    });

    updateJobState(job.id, {
      status: 'published',
      progress: 100,
      youtubeVideoId: result.videoId,
      youtubeUrl: result.url,
      completedAt: new Date().toISOString(),
      errorMessage: '',
      apiPayload: result.payload as unknown as Record<string, unknown>,
    });
    appendJobLog(job.id, 'info', `Успішно! Відео доступне за ID ${result.videoId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJobState(job.id, {
      status: 'failed',
      errorMessage: msg,
    });
    appendJobLog(job.id, 'error', `Помилка завантаження: ${msg}`);
  } finally {
    activeJobId = null;
  }
}

export async function triggerWorkerTick(): Promise<void> {
  if (isTickRunning || activeJobId !== null) return;
  isTickRunning = true;
  try {
    const nextJob = findNextDueJob();
    if (nextJob) {
      await processJob(nextJob);
    }
  } finally {
    isTickRunning = false;
  }
}

export function startBackgroundWorker(): void {
  resetInterruptedJobs();
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = setInterval(() => {
    void triggerWorkerTick();
  }, 5000);
  void triggerWorkerTick();
}

export function stopBackgroundWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

export function getActiveJobId(): number | null {
  return activeJobId;
}
