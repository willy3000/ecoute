import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { href } from '../../app/router';
import { Button, ConfirmDialog, IconButton } from '../../components/ui';
import { deleteWord, phraseContainsWord, setWordStatus } from '../../database/repositories/vocabulary';
import { db } from '../../database/schema/db';
import { engine } from '../../services/audio/engine';
import type { Phrase, VocabularyEntry } from '../../types';
import { normalize } from '../../utils/text';
import { WordForm } from './WordForm';

const PAGE = 60;

export function VocabularyTab() {
  const words = useLiveQuery(() => db.vocabulary.toArray(), []);
  const phrases = useLiveQuery(() => db.phrases.toArray(), []);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string>();
  const [editing, setEditing] = useState<VocabularyEntry | 'new'>();
  const [deleting, setDeleting] = useState<VocabularyEntry>();

  useEffect(() => () => engine.stop(), []);
  useEffect(() => setLimit(PAGE), [search, category, status]);

  const categories = useMemo(() => [...new Set(words?.map((w) => w.category))], [words]);
  const filtered = useMemo(() => {
    const q = normalize(search);
    return (words ?? [])
      .filter((w) => !q || normalize(`${w.french} ${w.english} ${w.forms.join(' ')}`).includes(q))
      .filter((w) => !category || w.category === category)
      .filter((w) => !status || w.status === status);
  }, [words, search, category, status]);

  const known = words?.filter((w) => w.status === 'known').length ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search size={16} className="pointer-events-none absolute top-3 left-3 text-fg-muted" />
          <input type="search" aria-label="Search vocabulary" placeholder="Search words" className="field pl-9!" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> Add word
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
        <select aria-label="Filter by category" className="field text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" className="field text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Known and unknown</option>
          <option value="unknown">Unknown</option>
          <option value="known">Known</option>
        </select>
      </div>
      <p className="mt-2 text-sm text-fg-muted" data-testid="word-count">
        {filtered.length} words · {known} known
      </p>

      <ul className="mt-3 divide-y divide-ink-800 border-y border-ink-800">
        {filtered.slice(0, limit).map((w) => (
          <WordRow
            key={w.id}
            word={w}
            phrases={phrases ?? []}
            expanded={open === w.id}
            onToggle={() => setOpen(open === w.id ? undefined : w.id)}
            onEdit={() => setEditing(w)}
            onDelete={() => setDeleting(w)}
          />
        ))}
      </ul>
      {filtered.length > limit ? (
        <div className="mt-3 text-center">
          <Button onClick={() => setLimit((l) => l + PAGE)}>Show more</Button>
        </div>
      ) : null}

      {editing ? <WordForm word={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this word?"
          body={`"${deleting.french}" will be removed from your vocabulary. Phrases are not affected.`}
          confirmLabel="Delete word"
          onConfirm={() => {
            void deleteWord(deleting.id);
            setDeleting(undefined);
          }}
          onCancel={() => setDeleting(undefined)}
        />
      ) : null}
    </>
  );
}

function WordRow({ word, phrases, expanded, onToggle, onEdit, onDelete }: { word: VocabularyEntry; phrases: Phrase[]; expanded: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const known = word.status === 'known';
  const matches = useMemo(() => (expanded ? phrases.filter((p) => phraseContainsWord(p, word)) : []), [expanded, phrases, word]);
  return (
    <li data-testid="word-row" className="py-2">
      <div className="flex items-center gap-1">
        <IconButton label={`Play ${word.french}`} disabled={!word.audioId} onClick={() => void engine.load(word.audioId, true)} className="shrink-0">
          <Play size={17} />
        </IconButton>
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
          <span className="min-w-0">
            <span lang="fr" className="french text-lg">{word.french}</span>
            {word.gender ? <span className="ml-1.5 text-xs text-fg-muted">{word.gender}</span> : null}
            <span className="block truncate text-sm text-fg-soft">{word.english}</span>
          </span>
          <ChevronDown size={16} className={`shrink-0 text-fg-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <IconButton label={known ? `Mark ${word.french} as unknown` : `Mark ${word.french} as known`} active={known} aria-pressed={known} onClick={() => void setWordStatus(word.id, known ? 'unknown' : 'known')} className="shrink-0">
          <Check size={18} />
        </IconButton>
      </div>
      {expanded ? (
        <div className="mt-1 ml-12 space-y-2 pb-2 text-sm">
          <p className="text-fg-muted">
            {word.partOfSpeech} · {word.category}
            {word.pronunciation ? <span className="ml-2 text-fg-soft">{word.pronunciation}</span> : null}
          </p>
          {word.exampleFrench ? (
            <div className="flex items-start gap-1">
              <IconButton label={`Play example for ${word.french}`} disabled={!word.exampleAudioId} onClick={() => void engine.load(word.exampleAudioId, true)} className="-mt-1.5 -ml-2 shrink-0">
                <Play size={15} />
              </IconButton>
              <p>
                <span lang="fr" className="french block text-base">{word.exampleFrench}</span>
                <span className="text-fg-soft">{word.exampleEnglish}</span>
              </p>
            </div>
          ) : null}
          <p className="text-fg-muted">
            {matches.length ? (
              <a className="text-teal-soft underline" href={href(`library/phrases/word/${encodeURIComponent(word.id)}`)}>
                See all {matches.length} phrases containing this word
              </a>
            ) : (
              'No phrases contain this word yet.'
            )}
          </p>
          {matches.length ? (
            <ul className="space-y-0.5">
              {matches.slice(0, 3).map((p) => (
                <li key={p.id} lang="fr" className="french text-base text-fg-soft">
                  {p.french}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={onEdit}>
              <Pencil size={14} /> Edit
            </Button>
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
