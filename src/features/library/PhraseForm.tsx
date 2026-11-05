import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Field, Modal } from '../../components/ui';
import { createPhrase, updatePhrase } from '../../database/repositories/phrases';
import { db } from '../../database/schema/db';
import type { Difficulty, LearningStatus, Phrase, Register } from '../../types';

const STATUSES: LearningStatus[] = ['new', 'learning', 'difficult', 'familiar', 'mastered'];

export function PhraseForm({ phrase, collectionId, onClose }: { phrase?: Phrase; collectionId?: string; onClose: () => void }) {
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), []);
  const [form, setForm] = useState({
    collectionId: phrase?.collectionId ?? collectionId ?? '',
    french: phrase?.french ?? '',
    english: phrase?.english ?? '',
    spokenAlternative: phrase?.spokenAlternative ?? '',
    difficulty: phrase?.difficulty ?? (1 as Difficulty),
    category: phrase?.category ?? '',
    tags: phrase?.vocabularyTags.join(', ') ?? '',
    pronunciationNotes: phrase?.pronunciationNotes ?? '',
    register: phrase?.register ?? ('standard' as Register),
    status: phrase?.status ?? ('new' as LearningStatus),
  });
  const [audio, setAudio] = useState<File>();
  const [removeAudio, setRemoveAudio] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const destination = form.collectionId || collections?.[0]?.id || '';
  const valid = form.french.trim() && form.english.trim() && destination;

  const save = async () => {
    if (!valid) return;
    const input = {
      collectionId: destination,
      french: form.french.trim(),
      english: form.english.trim(),
      spokenAlternative: form.spokenAlternative.trim() || undefined,
      difficulty: form.difficulty,
      category: form.category.trim() || 'General',
      vocabularyTags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      pronunciationNotes: form.pronunciationNotes.trim() || undefined,
      register: form.register,
    };
    if (phrase) {
      await updatePhrase(phrase.id, input, audio ?? (removeAudio ? null : undefined));
      if (form.status !== phrase.status) await db.phrases.update(phrase.id, { status: form.status });
    } else {
      const id = await createPhrase(input, audio);
      if (form.status !== 'new') await db.phrases.update(id, { status: form.status });
    }
    onClose();
  };

  return (
    <Modal
      title={phrase ? 'Edit phrase' : 'Add phrase'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="French">
          <input lang="fr" className="field" value={form.french} onChange={(e) => set('french', e.target.value)} autoFocus />
        </Field>
        <Field label="English">
          <input className="field" value={form.english} onChange={(e) => set('english', e.target.value)} />
        </Field>
        <Field label="Natural spoken alternative">
          <input lang="fr" className="field" value={form.spokenAlternative} onChange={(e) => set('spokenAlternative', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Collection">
            <select className="field" value={destination} onChange={(e) => set('collectionId', e.target.value)}>
              {collections?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <input className="field" value={form.category} onChange={(e) => set('category', e.target.value)} />
          </Field>
          <Field label="Difficulty">
            <select className="field" value={form.difficulty} onChange={(e) => set('difficulty', Number(e.target.value) as Difficulty)}>
              <option value={1}>1, starter</option>
              <option value={2}>2, core A1</option>
              <option value={3}>3, stretch</option>
            </select>
          </Field>
          <Field label="Register">
            <select className="field" value={form.register} onChange={(e) => set('register', e.target.value as Register)}>
              <option value="standard">Standard</option>
              <option value="informal">Informal</option>
            </select>
          </Field>
          <Field label="Learning status">
            <select className="field capitalize" value={form.status} onChange={(e) => set('status', e.target.value as LearningStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vocabulary tags" hint="Separate with commas">
            <input className="field" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
          </Field>
        </div>
        <Field label="Pronunciation notes">
          <textarea className="field" rows={2} value={form.pronunciationNotes} onChange={(e) => set('pronunciationNotes', e.target.value)} />
        </Field>
        <Field label="Recording" hint={phrase?.audioId && !removeAudio ? 'A recording is attached. Choose a file to replace it.' : 'MP3, M4A, OGG, WAV or WebM'}>
          <input type="file" accept="audio/*" className="field" onChange={(e) => setAudio(e.target.files?.[0])} />
        </Field>
        {phrase?.audioId && !audio ? (
          <label className="flex items-center gap-2 text-sm text-fg-soft">
            <input type="checkbox" checked={removeAudio} onChange={(e) => setRemoveAudio(e.target.checked)} /> Remove the recording
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
