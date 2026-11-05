import { SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { IconButton } from '../../components/ui';
import { useSettings } from '../../hooks/useSettings';
import type { Deck } from './useDeck';
import { BigPlay, DeckProgress, Finished, usePracticeAudio } from './shared';

/** Continuous listening with no text on screen, by design. */
export function ImmersionExercise({ deck }: { deck: Deck }) {
  const settings = useSettings();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gap = (settings?.autoAdvanceGapSeconds ?? 1.5) * 1000;
  const { advance } = deck;
  const onEnded = useCallback(() => {
    timer.current = setTimeout(advance, gap);
  }, [advance, gap]);
  usePracticeAudio('immersion', deck.current, true, onEnded);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (deck.finished) return <Finished deck={deck} />;
  const move = (fn: () => void) => {
    clearTimeout(timer.current);
    fn();
  };
  return (
    <>
      <DeckProgress deck={deck} />
      <div className="mt-10 flex items-center justify-center gap-4">
        <IconButton label="Previous phrase" disabled={deck.index === 0} onClick={() => move(deck.back)}>
          <SkipBack size={22} />
        </IconButton>
        <BigPlay />
        <IconButton label="Next phrase" onClick={() => move(deck.advance)}>
          <SkipForward size={22} />
        </IconButton>
      </div>
      <p className="mt-8 text-center text-sm text-fg-muted">No words on screen. Just listen, and let it play on.</p>
    </>
  );
}
