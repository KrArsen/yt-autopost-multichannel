import { useState } from 'react';
import { CheckSquare, Edit3, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { YOUTUBE_CATEGORIES, YOUTUBE_LANGUAGES } from '../constants/youtube';
import type { PresetRecord } from '../types';

interface PresetsViewProps {
  presets: PresetRecord[];
  onRefresh: () => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const EMPTY_PRESET = {
  name: '',
  descriptionFooter: '',
  defaultTags: [] as string[],
  categoryId: '22',
  defaultLanguage: 'uk',
  defaultAudioLanguage: 'uk',
  madeForKids: false,
  containsSyntheticMedia: false,
  hasPaidProductPlacement: false,
  notifySubscribers: true,
  embeddable: true,
  publicStatsViewable: true,
  license: 'youtube' as 'youtube' | 'creativeCommon',
  defaultPrivacy: 'public' as 'public' | 'unlisted' | 'private',
  waitForProcessing: true,
};

export function PresetsView({ presets, onRefresh, onNotify }: PresetsViewProps) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_PRESET);
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);

  function startCreate() {
    setEditingId('new');
    setForm(EMPTY_PRESET);
    setTagsText('');
  }

  function startEdit(p: PresetRecord) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      descriptionFooter: p.descriptionFooter,
      defaultTags: p.defaultTags,
      categoryId: p.categoryId,
      defaultLanguage: p.defaultLanguage,
      defaultAudioLanguage: p.defaultAudioLanguage,
      madeForKids: p.madeForKids,
      containsSyntheticMedia: p.containsSyntheticMedia,
      hasPaidProductPlacement: p.hasPaidProductPlacement,
      notifySubscribers: p.notifySubscribers,
      embeddable: p.embeddable,
      publicStatsViewable: p.publicStatsViewable,
      license: p.license,
      defaultPrivacy: p.defaultPrivacy,
      waitForProcessing: p.waitForProcessing,
    });
    setTagsText(p.defaultTags.join(', '));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      onNotify('error', 'Вкажіть назву пресету');
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      defaultTags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (editingId === 'new') {
        await api.createPreset(payload);
        onNotify('success', 'Новий пресет створено');
      } else if (typeof editingId === 'number') {
        await api.updatePreset(editingId, payload);
        onNotify('success', 'Пресет оновлено');
      }
      setEditingId(null);
      onRefresh();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deletePreset(id);
      onRefresh();
      onNotify('success', 'Пресет видалено');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Помилка видалення');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Пресети авто-галочок і шаблонів</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Налаштуйте один раз потрібні галочки («не для дітей», «це не AI», мова, категорія, футер опису) і
            прив’яжіть до каналів, щоб вони ставились автоматично.
          </p>
        </div>

        <button
          onClick={startCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Створити пресет
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {presets.map((p) => (
          <div key={p.id} className="bg-slate-900/75 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckSquare className="w-5 h-5 text-rose-400 shrink-0" />
                <h3 className="font-bold text-white text-base">{p.name}</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => startEdit(p)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                {p.madeForKids ? 'Для дітей' : 'Не для дітей'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                {p.containsSyntheticMedia ? 'Містить AI' : 'Це не AI'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300">
                Реклама: {p.hasPaidProductPlacement ? 'Так' : 'Ні'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300">
                Сповіщення: {p.notifySubscribers ? 'Так' : 'Ні'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300">
                Мова: {p.defaultAudioLanguage.toUpperCase()}
              </span>
            </div>

            {p.defaultTags.length > 0 && (
              <div className="text-xs text-slate-400">Теги: {p.defaultTags.join(', ')}</div>
            )}

            {p.descriptionFooter.trim() && (
              <pre className="text-xs text-slate-400 bg-slate-950/70 border border-slate-800 rounded-xl p-3 whitespace-pre-wrap font-sans">
                {p.descriptionFooter.trim()}
              </pre>
            )}
          </div>
        ))}
      </div>

      {editingId !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">
                {editingId === 'new' ? 'Новий пресет' : 'Редагування пресету'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Назва пресету *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Наприклад: Основний канал (Без AI)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Категорія</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {YOUTUBE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Мова аудіо</label>
                <select
                  value={form.defaultAudioLanguage}
                  onChange={(e) => setForm({ ...form, defaultAudioLanguage: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {YOUTUBE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ліцензія</label>
                <select
                  value={form.license}
                  onChange={(e) => setForm({ ...form, license: e.target.value as 'youtube' | 'creativeCommon' })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="youtube">Стандартна YouTube</option>
                  <option value="creativeCommon">Creative Commons</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Дефолтні теги (через кому)</label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Шаблонний футер опису (соцмережі, посилання, хештеги)
              </label>
              <textarea
                rows={3}
                value={form.descriptionFooter}
                onChange={(e) => setForm({ ...form, descriptionFooter: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <label className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!form.madeForKids}
                  onChange={(e) => setForm({ ...form, madeForKids: !e.target.checked })}
                  className="accent-rose-500"
                />
                Ні, відео НЕ для дітей
              </label>

              <label className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!form.containsSyntheticMedia}
                  onChange={(e) => setForm({ ...form, containsSyntheticMedia: !e.target.checked })}
                  className="accent-rose-500"
                />
                Це НЕ AI / синтетичний контент
              </label>

              <label className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.hasPaidProductPlacement}
                  onChange={(e) => setForm({ ...form, hasPaidProductPlacement: e.target.checked })}
                  className="accent-rose-500"
                />
                Містить платну рекламу
              </label>

              <label className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notifySubscribers}
                  onChange={(e) => setForm({ ...form, notifySubscribers: e.target.checked })}
                  className="accent-rose-500"
                />
                Сповіщати підписників
              </label>

              <label className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.embeddable}
                  onChange={(e) => setForm({ ...form, embeddable: e.target.checked })}
                  className="accent-rose-500"
                />
                Дозволити вбудовування
              </label>

              <label className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.publicStatsViewable}
                  onChange={(e) => setForm({ ...form, publicStatsViewable: e.target.checked })}
                  className="accent-rose-500"
                />
                Публічна статистика
              </label>

              <label className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.waitForProcessing}
                  onChange={(e) => setForm({ ...form, waitForProcessing: e.target.checked })}
                  className="accent-rose-500"
                />
                Чекати завершення HD-обробки перед відкриттям у Public
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium text-slate-300 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Збереження...' : 'Зберегти пресет'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
