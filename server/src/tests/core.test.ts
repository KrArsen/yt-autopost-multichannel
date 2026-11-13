import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { computeNextScheduleSlot } from '../scheduler.js';
import { buildYouTubeInsertPayload } from '../youtube.js';

test('AES-256-GCM token encryption roundtrip', () => {
  const token = '1//0gFakeRefreshToken_ABC123xyz';
  const encrypted = encryptSecret(token);
  assert.notEqual(encrypted, token);
  assert.equal(encrypted.split(':').length, 3);
  assert.equal(decryptSecret(encrypted), token);
});

test('buildYouTubeInsertPayload sets "not for kids", "not AI", and publishAt properly', () => {
  const futureIso = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const payload = buildYouTubeInsertPayload({
    title: 'Тестовий ролик',
    description: 'Опис ролика',
    tags: ['тег1', 'тег2'],
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
    scheduledFor: futureIso,
    waitForProcessing: true,
  });

  assert.deepEqual(payload.part, ['snippet', 'status', 'paidProductPlacementDetails']);
  assert.equal(payload.notifySubscribers, true);
  assert.equal(payload.requestBody.snippet.title, 'Тестовий ролик');
  assert.equal(payload.requestBody.snippet.categoryId, '28');
  assert.equal(payload.requestBody.status.selfDeclaredMadeForKids, false);
  assert.equal(payload.requestBody.status.containsSyntheticMedia, false);
  assert.equal(payload.requestBody.status.privacyStatus, 'private');
  assert.equal(payload.requestBody.status.publishAt, futureIso);
  assert.equal(payload.requestBody.status.embeddable, true);
  assert.equal(payload.requestBody.status.publicStatsViewable, true);
  assert.equal(payload.requestBody.paidProductPlacementDetails.hasPaidProductPlacement, false);
});

test('buildYouTubeInsertPayload handles AI flag and paid placement flag when enabled', () => {
  const payload = buildYouTubeInsertPayload({
    title: 'AI ролик',
    description: '',
    tags: [],
    categoryId: '22',
    defaultLanguage: 'en',
    defaultAudioLanguage: 'en',
    madeForKids: false,
    containsSyntheticMedia: true,
    hasPaidProductPlacement: true,
    notifySubscribers: false,
    embeddable: false,
    publicStatsViewable: false,
    license: 'creativeCommon',
    privacyStatus: 'public',
    publishMode: 'now',
    scheduledFor: null,
    waitForProcessing: false,
  });

  assert.equal(payload.notifySubscribers, false);
  assert.equal(payload.requestBody.status.privacyStatus, 'public');
  assert.equal(payload.requestBody.status.containsSyntheticMedia, true);
  assert.equal(payload.requestBody.status.embeddable, false);
  assert.equal(payload.requestBody.status.publicStatsViewable, false);
  assert.equal(payload.requestBody.status.license, 'creativeCommon');
  assert.equal(payload.requestBody.paidProductPlacementDetails.hasPaidProductPlacement, true);
});

test('computeNextScheduleSlot skips already occupied slots', () => {
  const base = new Date('2026-11-13T08:00:00.000Z');
  const firstSlot = computeNextScheduleSlot(
    { days: [0, 1, 2, 3, 4, 5, 6], times: ['12:00', '18:00'] },
    'UTC',
    [],
    base,
    15
  );
  assert.equal(firstSlot, '2026-11-13T12:00:00.000Z');

  const secondSlot = computeNextScheduleSlot(
    { days: [0, 1, 2, 3, 4, 5, 6], times: ['12:00', '18:00'] },
    'UTC',
    [firstSlot],
    base,
    15
  );
  assert.equal(secondSlot, '2026-11-13T18:00:00.000Z');
});
