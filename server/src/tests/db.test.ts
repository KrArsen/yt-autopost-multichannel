import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createJob,
  createPreset,
  deleteJob,
  deletePreset,
  getAppSettings,
  getChannelById,
  listChannels,
  listJobs,
  listPresets,
  updateChannelSettings,
} from '../db.js';
import { buildYouTubeInsertPayload } from '../youtube.js';

test('database initializes default presets and sandbox channel', () => {
  const presets = listPresets();
  assert.ok(presets.length >= 2);
  assert.equal(presets[0].madeForKids, false);
  assert.equal(presets[0].containsSyntheticMedia, false);

  const channels = listChannels();
  assert.ok(channels.length >= 1);
  assert.equal(channels[0].isDemo, true);

  const settings = getAppSettings();
  assert.ok(settings.publicBaseUrl.startsWith('http'));
});

test('creating and deleting preset and job works cleanly', () => {
  const preset = createPreset({
    name: 'Тестовий пресет',
    descriptionFooter: '\nФутер',
    defaultTags: ['test', 'video'],
    categoryId: '28',
    defaultLanguage: 'uk',
    defaultAudioLanguage: 'uk',
    madeForKids: false,
    containsSyntheticMedia: false,
    hasPaidProductPlacement: false,
    notifySubscribers: true,
    embeddable: true,
    publicStatsViewable: true,
    license: 'youtube',
    defaultPrivacy: 'public',
    waitForProcessing: true,
  });
  assert.ok(preset.id > 0);
  assert.equal(preset.madeForKids, false);
  assert.equal(preset.containsSyntheticMedia, false);

  const channels = listChannels();
  const demo = channels[0];
  const updatedChannel = updateChannelSettings(demo.id, { defaultPresetId: preset.id });
  assert.equal(updatedChannel?.defaultPresetId, preset.id);

  const schedIso = new Date(Date.now() + 3600_000).toISOString();
  const payload = buildYouTubeInsertPayload({
    title: 'DB Test Video',
    description: 'Desc',
    tags: ['test'],
    categoryId: '28',
    defaultLanguage: 'uk',
    defaultAudioLanguage: 'uk',
    madeForKids: false,
    containsSyntheticMedia: false,
    hasPaidProductPlacement: false,
    notifySubscribers: true,
    embeddable: true,
    publicStatsViewable: true,
    license: 'youtube',
    privacyStatus: 'public',
    publishMode: 'youtube_schedule',
    scheduledFor: schedIso,
    waitForProcessing: true,
  }) as unknown as Record<string, unknown>;

  const job = createJob({
    channelId: demo.id,
    title: 'DB Test Video',
    description: 'Desc',
    tags: ['test'],
    categoryId: '28',
    defaultLanguage: 'uk',
    defaultAudioLanguage: 'uk',
    madeForKids: false,
    containsSyntheticMedia: false,
    hasPaidProductPlacement: false,
    notifySubscribers: true,
    embeddable: true,
    publicStatsViewable: true,
    license: 'youtube',
    privacyStatus: 'public',
    publishMode: 'youtube_schedule',
    scheduledFor: schedIso,
    waitForProcessing: true,
    playlistId: '',
    videoFilename: 'nonexistent-test.mp4',
    videoOriginalName: 'test.mp4',
    videoSizeBytes: 1024,
    videoMimeType: 'video/mp4',
    thumbnailFilename: '',
    thumbnailOriginalName: '',
    apiPayload: payload,
  });

  assert.equal(job.status, 'scheduled');
  assert.equal(job.madeForKids, false);
  assert.equal(job.containsSyntheticMedia, false);

  const jobs = listJobs();
  assert.ok(jobs.some((j) => j.id === job.id));

  assert.equal(deleteJob(job.id), true);
  assert.equal(deletePreset(preset.id), true);
  // Ensure channel still exists and defaultPresetId cleaned up via ON DELETE SET NULL
  const refreshed = getChannelById(demo.id);
  assert.equal(refreshed?.defaultPresetId, null);
  updateChannelSettings(demo.id, { defaultPresetId: listPresets()[0]?.id ?? null });
});
