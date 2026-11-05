import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { engine } from '../../services/audio/engine';
import { compareDictation, type DictationResult, type WordResult } from '../../services/learning/dictation';
import { ratePhrase } from '../../services/learning/review';
import type { Rating } from '../../types';
import type { Deck } from './useDeck';
import { BigPlay, DeckProgress, Finished, usePracticeAudio } from './shared';

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ù', 'û', 'î', 'ï', 'ô', 'ç', 'œ', '’'];

export function DictationExercise({ deck }: { deck: Deck }) {
  const phrase = deck.current;
  usePracticeAudio('dictation', phrase);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<DictationResult>();
  const [plays, setPlays] = useState(1);
  const input = useRef<HTMLTextAreaElement>(null);
  const id = phrase?.id;

  useEffect(() => {
    setTyped('');
    setResult(undefined);
    setPlays(1);
    input.current?.focus();
  }, [id]);

  if (deck.finished || !phrase) return <Finished deck={deck} />;

  const insert = (ch: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? typed.length;
    const end = el?.selectionEnd ?? typed.length;
    setTyped(typed.slice(0, start) + ch + typed.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const check = async () => {
    const r = compareDictation(phrase.french, typed);
    setResult(r);
    // Typing it accurately is itself evidence of understanding what was heard.
    const rating: Rating = r.perfect ? (plays <= 1 ? 'immediate' : 'repetition') : r.score >= 0.7 ? 'repetition' : 'difficult';
    await ratePhrase(phrase.id, rating, 'dictation', plays);
  };

  return (
    <>
      <DeckProgress deck={deck} />
      <div className="mt-6 flex items-center justify-center gap-3">
        <BigPlay size="md" />
        <Button
          variant="ghost"
          onClick={() => {
            setPlays((p) => p + 1);
            void engine.replay();
          }}
        >
          <RotateCcw size={16} /> Replay
        </Button>
      </div>

      <label className="mt-5 block">
        <span className="mb-1 block text-sm font-medium text-fg-soft">Type what you hear</span>
        <textarea
          ref={input}
          lang="fr"
          rows={2}
          spellCheck={false}
          autoCapitalize="sentences"
          autoCorrect="off"
          disabled={Boolean(result)}
          className="field french text-xl"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && typed.trim()) {
              e.preventDefault();
              void check();
            }
          }}
        />
      </label>
      {!result ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1" aria-label="Insert accented letter">
            {ACCENTS.map((c) => (
              <button key={c} type="button" onClick={() => insert(c)} className="french size-9 rounded-md bg-ink-800 text-lg hover:bg-ink-700">
                {c}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={deck.advance}>
              Skip
            </Button>
            <Button variant="primary" disabled={!typed.trim()} onClick={() => void check()}>
              Check
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-ink-800 bg-ink-900 p-4" data-testid="dictation-result">
          <p className="text-sm font-medium" data-testid="dictation-score">
            {result.perfect ? 'Perfect.' : `${Math.round(result.score * 100)}% correct`}
          </p>
          <p lang="fr" className="french mt-2 text-xl leading-relaxed">
            {result.words.map((w, i) => (
              <WordMark key={i} word={w} />
            ))}
          </p>
          <div className="mt-3 border-t border-ink-800 pt-3">
            <p lang="fr" className="french text-xl">{phrase.french}</p>
            <p className="text-fg-soft">{phrase.english}</p>
          </div>
          <p className="mt-3 flex flex-wrap gap-x-3 text-xs text-fg-muted">
            <span className="underline decoration-amber decoration-2 underline-offset-2">Accent</span>
            <span className="text-rose line-through">Wrong or extra</span>
            <span className="rounded bg-rose/15 px-1 text-rose">Missing</span>
          </p>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={deck.advance} autoFocus>
              Next phrase
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function WordMark({ word }: { word: WordResult }) {
  const glue = (s: string) => (s.endsWith("'") ? '' : ' ');
  switch (word.kind) {
    case 'correct':
      return <span>{word.expected}{glue(word.expected)}</span>;
    case 'accent':
      return (
        <span>
          <span className="underline decoration-amber decoration-2 underline-offset-4" title={`You typed "${word.typed}"`}>{word.expected}</span>
          {glue(word.expected)}
        </span>
      );
    case 'wrong':
      return (
        <span>
          <span className="text-rose line-through">{word.typed}</span> <span className="rounded bg-rose/15 px-1">{word.expected}</span>{' '}
        </span>
      );
    case 'missing':
      return <span><span className="rounded bg-rose/15 px-1 text-rose">{word.expected}</span> </span>;
    case 'extra':
      return <span><span className="text-rose line-through">{word.typed}</span> </span>;
  }
}
