import { db } from '../../database/schema/db';
import type { Phrase, Rating, SessionMode } from '../../types';
import { dayKey } from '../../utils/text';
import { schedule } from './scheduler';

/** Records a rating, reschedules the phrase, and returns the updated phrase. */
export async function ratePhrase(phraseId: string, rating: Rating, mode: SessionMode, plays: number, now = Date.now()): Promise<Phrase | undefined> {
  return db.transaction('rw', db.phrases, db.reviews, async () => {
    const phrase = await db.phrases.get(phraseId);
    if (!phrase) return undefined;
    const next = schedule(phrase, rating, now);
    await db.phrases.update(phraseId, next);
    await db.reviews.add({ phraseId, rating, mode, plays, reviewedAt: now, day: dayKey(now) });
    return { ...phrase, ...next };
  });
}

/** Phrases due now, most overdue first, optionally limited to one collection. */
export async function dueQueue(collectionId?: string, now = Date.now()): Promise<Phrase[]> {
  const due = await db.phrases.where('dueAt').between(1, now, true, true).toArray();
  const scoped = collectionId ? due.filter((p) => p.collectionId === collectionId) : due;
  return scoped.sort((a, b) => a.dueAt - b.dueAt);
}

export async function logListening(mode: SessionMode, seconds: number, plays: number, collectionId?: string, now = Date.now()): Promise<void> {
  if (seconds <= 0 && plays <= 0) return;
  await db.sessions.add({ mode, collectionId, startedAt: now, seconds, plays, day: dayKey(now) });
}

export async function incrementListen(phraseId: string): Promise<void> {
  await db.phrases.where('id').equals(phraseId).modify((p) => {
    p.listenCount += 1;
  });
}
