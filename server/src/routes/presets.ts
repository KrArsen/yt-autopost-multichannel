import { Router } from 'express';
import { createPreset, deletePreset, listPresets, updatePreset } from '../db.js';

export const presetsRouter = Router();

function parsePresetBody(body: Record<string, unknown>) {
  const name = String(body.name || '').trim();
  if (!name) {
    throw new Error('Назва пресету обов’язкова');
  }
  const tags = Array.isArray(body.defaultTags)
    ? body.defaultTags.map((t) => String(t).trim()).filter(Boolean)
    : String(body.defaultTags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

  return {
    name,
    descriptionFooter: String(body.descriptionFooter ?? ''),
    defaultTags: tags,
    categoryId: String(body.categoryId || '22'),
    defaultLanguage: String(body.defaultLanguage || 'uk'),
    defaultAudioLanguage: String(body.defaultAudioLanguage || 'uk'),
    madeForKids: Boolean(body.madeForKids),
    containsSyntheticMedia: Boolean(body.containsSyntheticMedia),
    hasPaidProductPlacement: Boolean(body.hasPaidProductPlacement),
    notifySubscribers: body.notifySubscribers === undefined ? true : Boolean(body.notifySubscribers),
    embeddable: body.embeddable === undefined ? true : Boolean(body.embeddable),
    publicStatsViewable: body.publicStatsViewable === undefined ? true : Boolean(body.publicStatsViewable),
    license: body.license === 'creativeCommon' ? ('creativeCommon' as const) : ('youtube' as const),
    defaultPrivacy:
      body.defaultPrivacy === 'unlisted' || body.defaultPrivacy === 'private'
        ? (body.defaultPrivacy as 'unlisted' | 'private')
        : ('public' as const),
    waitForProcessing: body.waitForProcessing === undefined ? true : Boolean(body.waitForProcessing),
  };
}

presetsRouter.get('/', (_req, res) => {
  res.json({ presets: listPresets() });
});

presetsRouter.post('/', (req, res) => {
  try {
    const data = parsePresetBody((req.body || {}) as Record<string, unknown>);
    const preset = createPreset(data);
    res.status(201).json({ preset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

presetsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const data = parsePresetBody((req.body || {}) as Record<string, unknown>);
    const preset = updatePreset(id, data);
    if (!preset) {
      res.status(404).json({ error: 'Пресет не знайдено' });
      return;
    }
    res.json({ preset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

presetsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = deletePreset(id);
  if (!ok) {
    res.status(404).json({ error: 'Пресет не знайдено' });
    return;
  }
  res.json({ ok: true });
});
