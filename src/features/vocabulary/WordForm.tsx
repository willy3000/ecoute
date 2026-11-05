import { useState } from 'react';
import { Button, Field, Modal } from '../../components/ui';
import { createWord, updateWord } from '../../database/repositories/vocabulary';
import type { VocabularyEntry } from '../../types';

const PARTS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection', 'number', 'question word'];

export function WordForm({ word, onClose }: { word?: VocabularyEntry; onClose: () => void }) {
  const [form, setForm] = useState({
    french: word?.french ?? '',
    english: word?.english ?? '',
    partOfSpeech: word?.partOfSpeech ?? 'noun',
    gender: word?.gender ?? '',
    pronunciation: word?.pronunciation ?? '',
    exampleFrench: word?.exampleFrench ?? '',
    exampleEnglish: word?.exampleEnglish ?? '',
    category: word?.category ?? 'My words',
    forms: word?.forms.join(', ') ?? '',
  });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const valid = form.french.trim() && form.english.trim();

  const save = async () => {
    if (!valid) return;
    const input = {
      french: form.french.trim(),
      english: form.english.trim(),
      partOfSpeech: form.partOfSpeech,
      gender: form.gender.trim() || undefined,
      pronunciation: form.pronunciation.trim() || undefined,
      exampleFrench: form.exampleFrench.trim() || undefined,
      exampleEnglish: form.exampleEnglish.trim() || undefined,
      category: form.category.trim() || 'My words',
      forms: form.forms.split(',').map((f) => f.trim()).filter(Boolean),
    };
    if (word) await updateWord(word.id, input);
    else await createWord(input);
    onClose();
  };

  return (
    <Modal
      title={word ? 'Edit word' : 'Add word'}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="French">
            <input lang="fr" className="field" value={form.french} onChange={(e) => set('french', e.target.value)} autoFocus />
          </Field>
          <Field label="English meaning">
            <input className="field" value={form.english} onChange={(e) => set('english', e.target.value)} />
          </Field>
          <Field label="Part of speech">
            <select className="field" value={form.partOfSpeech} onChange={(e) => set('partOfSpeech', e.target.value)}>
              {PARTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gender">
            <select className="field" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">None</option>
              <option value="m">Masculine</option>
              <option value="f">Feminine</option>
              <option value="m,f">Either</option>
            </select>
          </Field>
          <Field label="Category">
            <input className="field" value={form.category} onChange={(e) => set('category', e.target.value)} />
          </Field>
          <Field label="Pronunciation">
            <input className="field" value={form.pronunciation} onChange={(e) => set('pronunciation', e.target.value)} />
          </Field>
        </div>
        <Field label="Example in French">
          <input lang="fr" className="field" value={form.exampleFrench} onChange={(e) => set('exampleFrench', e.target.value)} />
        </Field>
        <Field label="Example in English">
          <input className="field" value={form.exampleEnglish} onChange={(e) => set('exampleEnglish', e.target.value)} />
        </Field>
        <Field label="Other forms" hint="Conjugations or plurals, separated by commas. These help find phrases containing the word.">
          <input lang="fr" className="field" value={form.forms} onChange={(e) => set('forms', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
