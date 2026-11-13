import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { listChannels } from '../db.js';
import { triggerWorkerTick } from '../worker.js';

test('multipart upload + thumbnail + sandbox worker execution + cleanup end-to-end', async () => {
  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const channels = listChannels();
    const demoChannel = channels.find((c) => c.isDemo);
    assert.ok(demoChannel, 'Expected seeded sandbox channel');

    const form = new FormData();
    const mp4Bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );

    form.append('video', new Blob([mp4Bytes], { type: 'video/mp4' }), 'тестове-відео.mp4');
    form.append('thumbnail', new Blob([pngBytes], { type: 'image/png' }), 'preview.png');
    form.append('channelIds', JSON.stringify([demoChannel.id]));
    form.append('title', 'E2E Автопост Тест');
    form.append('description', 'Перевірка опису та галочок');
    form.append('tags', JSON.stringify(['тест', 'youtube']));
    form.append('categoryId', '22');
    form.append('madeForKids', 'false');
    form.append('containsSyntheticMedia', 'false');
    form.append('hasPaidProductPlacement', 'false');
    form.append('notifySubscribers', 'true');
    form.append('embeddable', 'true');
    form.append('publicStatsViewable', 'true');
    form.append('license', 'youtube');
    form.append('publishMode', 'youtube_schedule');
    // 5 hours ahead so it stays in 'scheduled' beyond the 120-min pre-upload window until /run-now
    form.append('scheduledFor', new Date(Date.now() + 5 * 3600_000).toISOString());

    const createRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      body: form,
    });
    assert.equal(createRes.status, 201);
    const createdBody = (await createRes.json()) as { jobs: Array<Record<string, unknown>> };
    assert.equal(createdBody.jobs.length, 1);

    const job = createdBody.jobs[0];
    const jobId = Number(job.id);
    const videoFilename = String(job.videoFilename);
    const thumbFilename = String(job.thumbnailFilename);

    assert.equal(job.status, 'scheduled');
    assert.equal(job.madeForKids, false);
    assert.equal(job.containsSyntheticMedia, false);
    assert.ok(fs.existsSync(path.join(config.uploadsDir, videoFilename)));
    assert.ok(fs.existsSync(path.join(config.thumbnailsDir, thumbFilename)));

    // Verify thumbnail preview endpoint works
    const thumbRes = await fetch(`${baseUrl}/api/media/thumbnail/${encodeURIComponent(thumbFilename)}`);
    assert.equal(thumbRes.status, 200);

    // Trigger immediate execution via /run-now
    const runRes = await fetch(`${baseUrl}/api/jobs/${jobId}/run-now`, { method: 'POST' });
    assert.equal(runRes.status, 200);

    // Poll until background worker completes simulated sandbox upload
    await triggerWorkerTick();
    let completed: Record<string, unknown> | undefined;
    for (let i = 0; i < 30; i++) {
      const listRes = await fetch(`${baseUrl}/api/jobs`);
      assert.equal(listRes.status, 200);
      const listData = (await listRes.json()) as { jobs: Array<Record<string, unknown>> };
      completed = listData.jobs.find((j) => Number(j.id) === jobId);
      if (completed?.status === 'published' || completed?.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(completed);
    assert.equal(completed.status, 'published');
    assert.equal(completed.progress, 100);
    assert.ok(String(completed.youtubeVideoId).startsWith('DEMO_'));

    const payload = completed.apiPayload as {
      notifySubscribers: boolean;
      requestBody: {
        status: {
          selfDeclaredMadeForKids: boolean;
          containsSyntheticMedia: boolean;
          privacyStatus: string;
          publishAt?: string;
        };
      };
    };
    assert.equal(payload.notifySubscribers, true);
    assert.equal(payload.requestBody.status.selfDeclaredMadeForKids, false);
    assert.equal(payload.requestBody.status.containsSyntheticMedia, false);
    assert.equal(payload.requestBody.status.privacyStatus, 'private');
    assert.ok(payload.requestBody.status.publishAt);

    // Clean up test job and verify disk files are removed
    const delRes = await fetch(`${baseUrl}/api/jobs/${jobId}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(fs.existsSync(path.join(config.uploadsDir, videoFilename)), false);
    assert.equal(fs.existsSync(path.join(config.thumbnailsDir, thumbFilename)), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('desktop local file path job + local preview + preserves original external file on delete', async () => {
  const prevIsDesktop = config.isDesktop;
  config.isDesktop = true;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-autopost-desktop-test-'));
  const externalVideoPath = path.join(tmpDir, 'external-demo.mp4');
  const externalThumbPath = path.join(tmpDir, 'external-thumb.png');
  fs.writeFileSync(externalVideoPath, Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]));
  fs.writeFileSync(
    externalThumbPath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );

  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const channels = listChannels();
    const demoChannel = channels.find((c) => c.isDemo);
    assert.ok(demoChannel, 'Expected seeded sandbox channel');

    const localPreviewRes = await fetch(
      `${baseUrl}/api/media/local-file?path=${encodeURIComponent(externalVideoPath)}`
    );
    assert.equal(localPreviewRes.status, 200);

    const createRes = await fetch(`${baseUrl}/api/jobs/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localVideoPath: externalVideoPath,
        localThumbPath: externalThumbPath,
        copyToAppStorage: false,
        channelIds: [demoChannel.id],
        title: 'Desktop Local Video Test',
        description: 'Локальний файл без копіювання',
        tags: ['desktop', 'local'],
        categoryId: '22',
        madeForKids: false,
        containsSyntheticMedia: false,
        publishMode: 'now',
      }),
    });
    assert.equal(createRes.status, 201);
    const createdBody = (await createRes.json()) as { jobs: Array<Record<string, unknown>> };
    assert.equal(createdBody.jobs.length, 1);

    const job = createdBody.jobs[0];
    const jobId = Number(job.id);
    const thumbFilename = String(job.thumbnailFilename);
    assert.equal(job.videoFilename, '');
    assert.equal(job.videoExternalPath, path.resolve(externalVideoPath));
    assert.ok(fs.existsSync(path.join(config.thumbnailsDir, thumbFilename)));

    await triggerWorkerTick();
    let completed: Record<string, unknown> | undefined;
    for (let i = 0; i < 30; i++) {
      const listRes = await fetch(`${baseUrl}/api/jobs`);
      assert.equal(listRes.status, 200);
      const listData = (await listRes.json()) as { jobs: Array<Record<string, unknown>> };
      completed = listData.jobs.find((j) => Number(j.id) === jobId);
      if (completed?.status === 'published' || completed?.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(completed);
    assert.equal(completed.status, 'published');
    assert.ok(String(completed.youtubeVideoId).startsWith('DEMO_'));

    const delRes = await fetch(`${baseUrl}/api/jobs/${jobId}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(fs.existsSync(path.join(config.thumbnailsDir, thumbFilename)), false);
    assert.equal(fs.existsSync(externalVideoPath), true);
  } finally {
    config.isDesktop = prevIsDesktop;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
