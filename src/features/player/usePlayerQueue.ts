import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSettings, updateSettings } from '../../database/repositories/settings';
import { phrasesInCollection } from '../../database/repositories/phrases';
import { db } from '../../database/schema/db';
import { dueQueue } from '../../services/learning/review';
import type { Phrase } from '../../types';

export const BOOKMARKS_SOURCE = '__bookmarks';
export const SPEED_OPTIONS = [0.75, 0.85, 1, 1.15, 1.25] as const;
export type ListenMode = 'continuous' | 'review';

async function loadBookmarks(): Promise<Phrase[]> {
  const marks = await db.bookmarks.orderBy('createdAt').toArray();
  const phrases = await db.phrases.bulkGet(marks.map((m) => m.phraseId));
  return phrases.filter((p): p is Phrase => Boolean(p));
}

/**
 * The ordered list of phrases being listened to, and the current position.
 * In review mode the queue is a snapshot, so rescheduling a phrase does not
 * shift it underneath the learner. Lost phrases get re-added a little later.
 */
export function usePlayerQueue(mode: ListenMode) {
  const [source, setSource] = useState<string>();
  const [index, setIndex] = useState(0);
  const [reviewIds, setReviewIds] = useState<string[]>();

  // Restore the last collection and phrase.
  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      const first = s.lastCollectionId ?? (await db.collections.orderBy('order').first())?.id;
      setSource(first);
    })();
  }, []);

  const continuous = useLiveQuery(async () => {
    if (!source) return undefined;
    return source === BOOKMARKS_SOURCE ? loadBookmarks() : phrasesInCollection(source);
  }, [source]);

  // Take a new review snapshot whenever review mode opens or the source changes.
  useEffect(() => {
    if (mode !== 'review') return;
    void dueQueue(source === BOOKMARKS_SOURCE ? undefined : source).then((due) => {
      setReviewIds(due.map((p) => p.id));
      setIndex(0);
    });
  }, [mode, source]);

  const reviewRows = useLiveQuery(async () => (reviewIds ? db.phrases.bulkGet(reviewIds) : undefined), [reviewIds]);
  const reviewList = useMemo(() => reviewRows?.filter((p): p is Phrase => Boolean(p)), [reviewRows]);

  const list = mode === 'review' ? reviewList : continuous;
  const clamped = list ? Math.min(index, Math.max(0, list.length - 1)) : 0;
  const current = list?.[clamped];

  // Resume at the saved phrase when a collection's list first arrives.
  const [restoredFor, setRestoredFor] = useState<string>();
  useEffect(() => {
    if (mode !== 'continuous' || !source || !continuous || restoredFor === source) return;
    void getSettings().then((s) => {
      const saved = s.lastPhraseByCollection[source];
      const at = saved ? continuous.findIndex((p) => p.id === saved) : -1;
      setIndex(at >= 0 ? at : 0);
      setRestoredFor(source);
    });
  }, [mode, source, continuous, restoredFor]);

  // Persist the position.
  const currentId = current?.id;
  useEffect(() => {
    if (mode !== 'continuous' || !source || !currentId || restoredFor !== source) return;
    void getSettings().then((s) => {
      if (s.lastPhraseByCollection[source] === currentId && s.lastCollectionId === source) return;
      void updateSettings({ lastCollectionId: source, lastPhraseByCollection: { ...s.lastPhraseByCollection, [source]: currentId } });
    });
  }, [mode, source, currentId, restoredFor]);

  const selectSource = useCallback((id: string) => {
    setSource(id);
    setIndex(0);
    void updateSettings({ lastCollectionId: id });
  }, []);

  const next = useCallback(() => setIndex((i) => (list ? Math.min(i + 1, list.length - 1) : i)), [list]);
  const previous = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  /** Puts a lost phrase back a few places ahead, so it returns later this session. */
  const requeue = useCallback((id: string) => {
    setReviewIds((ids) => {
      if (!ids) return ids;
      const at = Math.min(clamped + 4, ids.length);
      return [...ids.slice(0, at), id, ...ids.slice(at)];
    });
  }, [clamped]);

  return { source, selectSource, list, index: clamped, current, next, previous, requeue, setIndex };
}
