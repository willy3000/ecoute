import { Loader2, Pause, Play } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../../components/ui';
import { useEngine } from '../../hooks/useAudio';
import { useListeningLog } from '../../hooks/useListeningLog';
import { engine } from '../../services/audio/engine';
import { incrementListen } from '../../services/learning/review';
import type { Phrase, SessionMode } from '../../types';
import type { Deck } from './useDeck';

/** Loads each phrase into the shared engine, counts listens, and logs time. */
export function usePracticeAudio(mode: SessionMode, phrase: Phrase | undefined, autoplay = true, onEnded?: () => void): void {
  useListeningLog(mode, phrase?.collectionId);
  const id = phrase?.id;
  const audioId = phrase?.audioId;
  useEffect(() => {
    if (audioId) void engine.load(audioId, autoplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, audioId]);
  useEffect(() => {
    engine.onEnded = () => {
      if (id) void incrementListen(id);
      onEnded?.();
    };
    return () => {
      engine.onEnded = null;
    };
  }, [id, onEnded]);
  useEffect(() => () => engine.stop(), []);
}

export function BigPlay({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const audio = useEngine();
  const playing = audio.status === 'playing';
  const box = size === 'lg' ? 'size-24' : 'size-16';
  return (
    <button type="button" aria-label={playing ? 'Pause' : 'Play'} data-state={audio.status} onClick={() => engine.toggle()} className={`flex ${box} items-center justify-center rounded-full bg-teal text-ink-950 transition-transform hover:bg-teal-soft active:scale-95`}>
      {audio.status === 'loading' ? <Loader2 size={32} className="animate-spin" /> : playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="ml-1" />}
    </button>
  );
}

export function DeckProgress({ deck }: { deck: Deck }) {
  const total = deck.phrases?.length ?? 0;
  return (
    <div className="mt-5">
      <p className="text-sm text-fg-muted" data-testid="deck-position">
        {Math.min(deck.index + 1, total)} of {total}
      </p>
      <div className="mt-1.5 h-0.5 rounded-full bg-ink-800">
        <div className="h-full rounded-full bg-teal" style={{ width: `${(deck.index / Math.max(1, total)) * 100}%` }} />
      </div>
    </div>
  );
}

export function Finished({ deck, children }: { deck: Deck; children?: React.ReactNode }) {
  return (
    <div className="mt-12 text-center" data-testid="session-finished">
      <p className="french text-3xl">C’est fini.</p>
      <p className="mt-1 text-fg-muted">{children ?? `You worked through ${deck.phrases?.length ?? 0} phrases.`}</p>
      <Button className="mt-5" variant="primary" onClick={deck.restart}>
        Start another session
      </Button>
    </div>
  );
}
