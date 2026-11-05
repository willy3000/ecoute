import { useCallback, useEffect, useState } from 'react';
import { db } from '../../database/schema/db';
import { dueQueue } from '../../services/learning/review';
import type { Phrase } from '../../types';

const DECK_SIZE = 20;

export interface Deck {
  phrases: Phrase[] | undefined;
  index: number;
  current: Phrase | undefined;
  finished: boolean;
  advance: () => void;
  back: () => void;
  /** Adds a phrase back a few places ahead. */
  requeue: (phrase: Phrase) => void;
  restart: () => void;
}

/** A fixed session deck: phrases due first, then new phrases, all with recordings. */
export function useDeck(collectionId?: string): Deck {
  const [phrases, setPhrases] = useState<Phrase[]>();
  const [index, setIndex] = useState(0);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const due = (await dueQueue(collectionId)).filter((p) => p.audioId);
      const pool = collectionId ? db.phrases.where('collectionId').equals(collectionId) : db.phrases.toCollection();
      const fresh = (await pool.filter((p) => p.status === 'new' && Boolean(p.audioId)).toArray()).sort((a, b) => a.difficulty - b.difficulty || a.order - b.order);
      if (live) {
        setPhrases([...due, ...fresh].slice(0, DECK_SIZE));
        setIndex(0);
      }
    })();
    return () => {
      live = false;
    };
  }, [collectionId, generation]);

  const advance = useCallback(() => setIndex((i) => i + 1), []);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const restart = useCallback(() => setGeneration((g) => g + 1), []);
  const requeue = useCallback(
    (phrase: Phrase) => {
      setPhrases((list) => {
        if (!list) return list;
        const at = Math.min(index + 4, list.length);
        return [...list.slice(0, at), phrase, ...list.slice(at)];
      });
    },
    [index],
  );

  return { phrases, index, current: phrases?.[index], finished: Boolean(phrases && index >= phrases.length), advance, back, requeue, restart };
}
