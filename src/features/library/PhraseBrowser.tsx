import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { href } from '../../app/router';
import { Button, ConfirmDialog, IconButton, RegisterBadge, StatusBadge } from '../../components/ui';
import { deletePhrase, toggleBookmark } from '../../database/repositories/phrases';
import { phraseContainsWord } from '../../database/repositories/vocabulary';
import { db } from '../../database/schema/db';
import { useEngine } from '../../hooks/useAudio';
import { engine } from '../../services/audio/engine';
import type { Phrase } from '../../types';
import { normalize } from '../../utils/text';
import { PhraseForm } from './PhraseForm';

type Sort = 'order' | 'french' | 'english' | 'difficulty' | 'status' | 'updated';
const STATUS_RANK: Record<string, number> = { difficult: 0, learning: 1, new: 2, familiar: 3, mastered: 4 };
const PAGE = 60;

const SORTERS: Record<Sort, (a: Phrase, b: Phrase) => number> = {
  order: (a, b) => a.order - b.order,
  french: (a, b) => a.french.localeCompare(b.french, 'fr'),
  english: (a, b) => a.english.localeCompare(b.english),
  difficulty: (a, b) => a.difficulty - b.difficulty,
  status: (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  updated: (a, b) => b.updatedAt - a.updatedAt,
};

export function PhraseBrowser({ collectionId, wordId }: { collectionId?: string; wordId?: string }) {
  const phrases = useLiveQuery(() => (collectionId ? db.phrases.where('collectionId').equals(collectionId).toArray() : db.phrases.toArray()), [collectionId]);
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), []);
  const bookmarks = useLiveQuery(async () => new Set((await db.bookmarks.toArray()).map((b) => b.phraseId)), []);
  const word = useLiveQuery(async () => (wordId ? db.vocabulary.get(wordId) : undefined), [wordId]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [category, setCategory] = useState('');
  const [register, setRegister] = useState('');
  const [collection, setCollection] = useState('');
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const [sort, setSort] = useState<Sort>('order');
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<Phrase | 'new'>();
  const [deleting, setDeleting] = useState<Phrase>();
  const audio = useEngine();

  useEffect(() => () => engine.stop(), []);
  useEffect(() => setLimit(PAGE), [search, status, difficulty, category, register, collection, onlyBookmarked, sort]);

  const categories = useMemo(() => [...new Set(phrases?.map((p) => p.category))].sort(), [phrases]);

  const filtered = useMemo(() => {
    if (!phrases) return [];
    const q = normalize(search);
    const rank = new Map(collections?.map((c) => [c.id, c.order]));
    const byCollection = (a: Phrase, b: Phrase) => (rank.get(a.collectionId) ?? 0) - (rank.get(b.collectionId) ?? 0);
    return phrases
      .filter((p) => !q || normalize(`${p.french} ${p.english} ${p.spokenAlternative ?? ''} ${p.vocabularyTags.join(' ')}`).includes(q))
      .filter((p) => !status || p.status === status)
      .filter((p) => !difficulty || String(p.difficulty) === difficulty)
      .filter((p) => !category || p.category === category)
      .filter((p) => !register || p.register === register)
      .filter((p) => !collection || p.collectionId === collection)
      .filter((p) => !onlyBookmarked || bookmarks?.has(p.id))
      .filter((p) => !word || phraseContainsWord(p, word))
      .sort((a, b) => (sort === 'order' ? byCollection(a, b) : 0) || SORTERS[sort](a, b));
  }, [phrases, collections, search, status, difficulty, category, register, collection, onlyBookmarked, bookmarks, word, sort]);

  const toggleRow = (p: Phrase) => {
    if (audio.audioId === p.audioId && audio.status === 'playing') engine.pause();
    else if (audio.audioId === p.audioId) void engine.replay();
    else void engine.load(p.audioId, true);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Search phrases" placeholder="Search French, English or tags" className="field min-w-48 flex-1" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> Add phrase
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {!collectionId ? (
          <select aria-label="Filter by collection" className="field text-sm" value={collection} onChange={(e) => setCollection(e.target.value)}>
            <option value="">All collections</option>
            {collections?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        ) : null}
        <select aria-label="Filter by status" className="field text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="new">New</option>
          <option value="learning">Learning</option>
          <option value="difficult">Difficult</option>
          <option value="familiar">Familiar</option>
          <option value="mastered">Mastered</option>
        </select>
        <select aria-label="Filter by difficulty" className="field text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Any difficulty</option>
          <option value="1">1, starter</option>
          <option value="2">2, core A1</option>
          <option value="3">3, stretch</option>
        </select>
        <select aria-label="Filter by category" className="field text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Filter by register" className="field text-sm" value={register} onChange={(e) => setRegister(e.target.value)}>
          <option value="">Any register</option>
          <option value="standard">Standard</option>
          <option value="informal">Informal</option>
        </select>
        <select aria-label="Sort phrases" className="field text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="order">Collection order</option>
          <option value="french">French A to Z</option>
          <option value="english">English A to Z</option>
          <option value="difficulty">Easiest first</option>
          <option value="status">Hardest status first</option>
          <option value="updated">Recently changed</option>
        </select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-fg-muted">
        <span data-testid="phrase-count">{filtered.length} phrases</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyBookmarked} onChange={(e) => setOnlyBookmarked(e.target.checked)} /> Bookmarked only
        </label>
        {word ? (
          <a href={href('library/phrases')} className="inline-flex items-center gap-1 rounded-full bg-teal-deep px-2.5 py-0.5 text-teal-soft">
            Containing "{word.french}" <X size={13} />
          </a>
        ) : null}
      </div>

      <ul className="mt-3 divide-y divide-ink-800 border-y border-ink-800">
        {filtered.slice(0, limit).map((p) => {
          const isCurrent = audio.audioId === p.audioId && Boolean(p.audioId);
          const marked = bookmarks?.has(p.id) ?? false;
          return (
            <li key={p.id} data-testid="phrase-row" className="flex items-start gap-1 py-2">
              <IconButton label={`Play ${p.french}`} disabled={!p.audioId} active={isCurrent && audio.status === 'playing'} onClick={() => toggleRow(p)} className="shrink-0">
                {isCurrent && audio.status === 'playing' ? <Pause size={18} /> : <Play size={18} />}
              </IconButton>
              <div className="min-w-0 flex-1 py-1">
                <p lang="fr" className="french text-lg leading-snug">
                  {p.french}
                </p>
                <p className="text-sm text-fg-soft">{p.english}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                  <StatusBadge status={p.status} />
                  {p.register === 'informal' ? <RegisterBadge /> : null}
                  <span>Level {p.difficulty}</span>
                  <span>· {p.category}</span>
                  {!p.audioId ? <span className="text-amber">· No recording</span> : null}
                </div>
              </div>
              <IconButton label={`${marked ? 'Remove bookmark from' : 'Bookmark'} ${p.french}`} active={marked} onClick={() => void toggleBookmark(p.id)} className="shrink-0">
                <Bookmark size={17} fill={marked ? 'currentColor' : 'none'} />
              </IconButton>
              <IconButton label={`Edit ${p.french}`} onClick={() => setEditing(p)} className="shrink-0">
                <Pencil size={16} />
              </IconButton>
              <IconButton label={`Delete ${p.french}`} onClick={() => setDeleting(p)} className="shrink-0">
                <Trash2 size={16} />
              </IconButton>
            </li>
          );
        })}
      </ul>
      {filtered.length > limit ? (
        <div className="mt-3 text-center">
          <Button onClick={() => setLimit((l) => l + PAGE)}>Show more</Button>
        </div>
      ) : null}
      {phrases && filtered.length === 0 ? <p className="mt-6 text-center text-sm text-fg-muted">No phrases match these filters.</p> : null}

      {editing ? <PhraseForm phrase={editing === 'new' ? undefined : editing} collectionId={collectionId} onClose={() => setEditing(undefined)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this phrase?"
          body={`"${deleting.french}", its recording, and its progress will be removed from this device.`}
          confirmLabel="Delete phrase"
          onConfirm={() => {
            void deletePhrase(deleting.id);
            setDeleting(undefined);
          }}
          onCancel={() => setDeleting(undefined)}
        />
      ) : null}
    </>
  );
}
