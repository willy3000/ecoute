import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Ear, Keyboard, Languages, Mic, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { href } from '../../app/router';
import { db } from '../../database/schema/db';
import { useSettings } from '../../hooks/useSettings';
import type { PracticeMode } from '../../types';
import { ComprehensionExercise } from './ComprehensionExercise';
import { DictationExercise } from './DictationExercise';
import { ImmersionExercise } from './ImmersionExercise';
import { ShadowingExercise } from './ShadowingExercise';
import { useDeck } from './useDeck';

const MODES: { id: PracticeMode; title: string; description: string; icon: LucideIcon }[] = [
  { id: 'immersion', title: 'Immersion', description: 'Listen with no text at all. Let the sound of French wash over you.', icon: Ear },
  { id: 'comprehension', title: 'Comprehension', description: 'Listen, check the English, and rate how much you understood.', icon: Languages },
  { id: 'shadowing', title: 'Shadowing', description: 'Listen and repeat aloud. Optionally record yourself and compare.', icon: Mic },
  { id: 'dictation', title: 'Dictation', description: 'Listen and type the French. See exactly which words differ.', icon: Keyboard },
];

export function PracticePage({ route }: { route: string[] }) {
  const mode = MODES.find((m) => m.id === route[0]);
  const settings = useSettings();
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), []);
  const [collectionId, setCollectionId] = useState('');
  useEffect(() => {
    if (!collectionId && settings?.lastCollectionId) setCollectionId(settings.lastCollectionId);
  }, [settings?.lastCollectionId, collectionId]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 md:px-8 md:py-8">
      {mode ? (
        <>
          <a href={href('practice')} className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
            <ArrowLeft size={15} /> All exercises
          </a>
          <h1 className="text-2xl font-semibold tracking-tight">{mode.title}</h1>
        </>
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">Practice</h1>
      )}
      <select aria-label="Practice collection" className="field mt-3" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
        <option value="">All collections</option>
        {collections?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>

      {mode ? (
        <Session mode={mode.id} collectionId={collectionId || undefined} key={`${mode.id}-${collectionId}`} />
      ) : (
        <>
          <p className="mt-4 text-sm text-fg-muted">Each session draws up to 20 phrases: those due for review first, then new ones. All of it is optional.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {MODES.map(({ id, title, description, icon: Icon }) => (
              <li key={id}>
                <a href={href(`practice/${id}`)} className={`block h-full rounded-xl border bg-ink-900 p-4 transition-colors hover:border-ink-600 ${settings?.defaultPracticeMode === id ? 'border-teal/60' : 'border-ink-800'}`}>
                  <Icon size={20} className="text-teal-soft" />
                  <p className="mt-2 font-medium">
                    {title}
                    {settings?.defaultPracticeMode === id ? <span className="ml-2 text-xs font-normal text-fg-muted">Your default</span> : null}
                  </p>
                  <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Session({ mode, collectionId }: { mode: PracticeMode; collectionId?: string }) {
  const deck = useDeck(collectionId);
  if (!deck.phrases) return <p className="mt-8 text-center text-fg-muted">Preparing phrases</p>;
  if (deck.phrases.length === 0) return <p className="mt-8 text-center text-fg-muted">There are no phrases with recordings in this collection.</p>;
  if (mode === 'immersion') return <ImmersionExercise deck={deck} />;
  if (mode === 'comprehension') return <ComprehensionExercise deck={deck} />;
  if (mode === 'shadowing') return <ShadowingExercise deck={deck} />;
  return <DictationExercise deck={deck} />;
}
