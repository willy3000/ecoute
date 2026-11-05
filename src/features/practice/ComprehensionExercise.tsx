import { Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RatingBar } from '../../components/RatingBar';
import { Button } from '../../components/ui';
import { engine } from '../../services/audio/engine';
import { ratePhrase } from '../../services/learning/review';
import type { Rating } from '../../types';
import type { Deck } from './useDeck';
import { BigPlay, DeckProgress, Finished, usePracticeAudio } from './shared';

export function ComprehensionExercise({ deck }: { deck: Deck }) {
  const phrase = deck.current;
  const [revealed, setRevealed] = useState(false);
  const [plays, setPlays] = useState(0);
  usePracticeAudio('comprehension', phrase);

  const id = phrase?.id;
  useEffect(() => {
    setRevealed(false);
    setPlays(0);
  }, [id]);
  useEffect(() => {
    const previous = engine.onEnded;
    engine.onEnded = (a) => {
      previous?.(a);
      setPlays((p) => p + 1);
    };
    return () => {
      engine.onEnded = previous;
    };
  }, [id]);

  if (deck.finished || !phrase) return <Finished deck={deck} />;

  const rate = async (rating: Rating) => {
    await ratePhrase(phrase.id, rating, 'comprehension', Math.max(1, plays));
    if (rating === 'unknown') deck.requeue(phrase);
    deck.advance();
  };

  return (
    <>
      <DeckProgress deck={deck} />
      <div className="mt-8 flex justify-center">
        <BigPlay />
      </div>
      <div className="mt-8 rounded-xl border border-ink-800 bg-ink-900 p-4 text-center">
        {revealed ? (
          <>
            <p className="text-lg" data-testid="english">{phrase.english}</p>
            <p lang="fr" className="french mt-1 text-xl text-fg-soft" data-testid="french">{phrase.french}</p>
          </>
        ) : (
          <Button onClick={() => setRevealed(true)}>
            <Eye size={16} /> Reveal the meaning
          </Button>
        )}
      </div>
      {revealed ? (
        <div className="mt-4">
          <p className="mb-2 text-sm text-fg-muted">How well did you understand?</p>
          <RatingBar onRate={(r) => void rate(r)} />
        </div>
      ) : null}
    </>
  );
}
