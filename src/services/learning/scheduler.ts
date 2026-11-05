import type { LearningStatus, Phrase, Rating } from '../../types';

const DAY = 24 * 60 * 60 * 1000;
/** "Unknown" phrases return later in the same session, or after this gap otherwise. */
const SAME_SESSION_DELAY = 10 * 60 * 1000;
const MAX_INTERVAL_DAYS = 30;

export type ScheduleFields = Pick<Phrase, 'status' | 'dueAt' | 'intervalDays' | 'streak' | 'lapses' | 'reviewCount' | 'lastReviewedAt' | 'firstRating'>;

/**
 * Next review state after a rating. Starting points follow the brief, then the
 * interval adapts: repeated immediate understanding stretches towards 30 days,
 * and failing a phrase that was long-spaced shortens it again.
 */
export function schedule(current: ScheduleFields, rating: Rating, now = Date.now()): ScheduleFields {
  const base = {
    reviewCount: current.reviewCount + 1,
    lastReviewedAt: now,
    firstRating: current.firstRating ?? rating,
  };

  switch (rating) {
    case 'unknown':
      return {
        ...base,
        status: current.reviewCount === 0 ? 'learning' : 'difficult',
        dueAt: now + SAME_SESSION_DELAY,
        intervalDays: 0,
        streak: 0,
        lapses: current.lapses + 1,
      };
    case 'difficult':
      return { ...base, status: 'difficult', dueAt: now + DAY, intervalDays: 1, streak: 0, lapses: current.lapses };
    case 'repetition': {
      // Two days at first, three once the phrase has held an interval.
      const intervalDays = current.intervalDays >= 2 ? 3 : 2;
      return { ...base, status: 'learning', dueAt: now + intervalDays * DAY, intervalDays, streak: 0, lapses: current.lapses };
    }
    case 'immediate': {
      const streak = current.streak + 1;
      const intervalDays = immediateInterval(streak, current.intervalDays);
      return { ...base, status: statusForStreak(streak), dueAt: now + intervalDays * DAY, intervalDays, streak, lapses: current.lapses };
    }
  }
}

function immediateInterval(streak: number, previous: number): number {
  if (streak === 1) return 5;
  if (streak === 2) return 7;
  // Consistently understood: 14 days, then roughly doubling up to the cap.
  return Math.min(MAX_INTERVAL_DAYS, Math.max(14, Math.round(previous * 2)));
}

function statusForStreak(streak: number): LearningStatus {
  return streak >= 3 ? 'mastered' : 'familiar';
}

export function isDue(phrase: Pick<Phrase, 'dueAt'>, now = Date.now()): boolean {
  return phrase.dueAt > 0 && phrase.dueAt <= now;
}

/** Order a review queue: most overdue first, with difficult phrases ahead on ties. */
export function reviewOrder(a: Pick<Phrase, 'dueAt' | 'status'>, b: Pick<Phrase, 'dueAt' | 'status'>): number {
  if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
  return (a.status === 'difficult' ? 0 : 1) - (b.status === 'difficult' ? 0 : 1);
}

/** Describes when a phrase is next due, for showing beside a rating. */
export function describeInterval(fields: ScheduleFields, now = Date.now()): string {
  const ms = fields.dueAt - now;
  if (ms < DAY) return 'later today';
  const days = Math.round(ms / DAY);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}
