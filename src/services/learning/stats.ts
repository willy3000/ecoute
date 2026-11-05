import type { LearningStatus, ListeningSession, Phrase, ReviewRecord, VocabularyEntry } from '../../types';
import { dayKey } from '../../utils/text';

export interface DayBucket {
  day: string;
  label: string;
  seconds: number;
  reviews: number;
}

export interface WeekBucket {
  start: string;
  label: string;
  seconds: number;
  reviews: number;
}

export interface ProgressStats {
  totalPhrases: number;
  byStatus: Record<LearningStatus, number>;
  ratedPhrases: number;
  /** Share of rated phrases understood on their very first rating, or null with no data. */
  firstListenRate: number | null;
  /** Mean plays before a rating, or null with no data. */
  averagePlays: number | null;
  totalSeconds: number;
  totalPlays: number;
  last7: DayBucket[];
  last8Weeks: WeekBucket[];
  difficultPhrases: Phrase[];
  challengingWords: { word: string; misses: number; rated: number }[];
  knownWords: number;
  totalWords: number;
}

const DAY = 86_400_000;

export function computeStats(phrases: Phrase[], reviews: ReviewRecord[], sessions: ListeningSession[], vocabulary: VocabularyEntry[], now = Date.now()): ProgressStats {
  const byStatus: Record<LearningStatus, number> = { new: 0, learning: 0, difficult: 0, familiar: 0, mastered: 0 };
  for (const p of phrases) byStatus[p.status]++;

  const rated = phrases.filter((p) => p.firstRating);
  const firstListen = rated.filter((p) => p.firstRating === 'immediate').length;
  const totalPlaysAtRating = reviews.reduce((sum, r) => sum + r.plays, 0);

  const secondsByDay = new Map<string, number>();
  for (const s of sessions) secondsByDay.set(s.day, (secondsByDay.get(s.day) ?? 0) + s.seconds);
  const reviewsByDay = new Map<string, number>();
  for (const r of reviews) reviewsByDay.set(r.day, (reviewsByDay.get(r.day) ?? 0) + 1);

  const last7: DayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    const day = dayKey(d);
    last7.push({
      day,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      seconds: secondsByDay.get(day) ?? 0,
      reviews: reviewsByDay.get(day) ?? 0,
    });
  }

  const last8Weeks: WeekBucket[] = [];
  const startOfWeek = new Date(now);
  startOfWeek.setHours(12, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  for (let w = 7; w >= 0; w--) {
    const start = new Date(startOfWeek.getTime() - w * 7 * DAY);
    let seconds = 0;
    let weekReviews = 0;
    for (let i = 0; i < 7; i++) {
      const day = dayKey(new Date(start.getTime() + i * DAY));
      seconds += secondsByDay.get(day) ?? 0;
      weekReviews += reviewsByDay.get(day) ?? 0;
    }
    last8Weeks.push({ start: dayKey(start), label: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), seconds, reviews: weekReviews });
  }

  const byId = new Map(phrases.map((p) => [p.id, p]));
  const wordTally = new Map<string, { misses: number; rated: number }>();
  for (const r of reviews) {
    const phrase = byId.get(r.phraseId);
    if (!phrase) continue;
    const missed = r.rating === 'unknown' || r.rating === 'difficult';
    for (const word of phrase.vocabularyTags) {
      const t = wordTally.get(word) ?? { misses: 0, rated: 0 };
      t.rated++;
      if (missed) t.misses++;
      wordTally.set(word, t);
    }
  }
  const challengingWords = [...wordTally.entries()]
    .filter(([, t]) => t.misses > 0)
    .map(([word, t]) => ({ word, ...t }))
    .sort((a, b) => b.misses - a.misses || b.misses / b.rated - a.misses / a.rated || a.word.localeCompare(b.word))
    .slice(0, 10);

  return {
    totalPhrases: phrases.length,
    byStatus,
    ratedPhrases: rated.length,
    firstListenRate: rated.length ? firstListen / rated.length : null,
    averagePlays: reviews.length ? totalPlaysAtRating / reviews.length : null,
    totalSeconds: sessions.reduce((sum, s) => sum + s.seconds, 0),
    totalPlays: sessions.reduce((sum, s) => sum + s.plays, 0),
    last7,
    last8Weeks,
    difficultPhrases: phrases
      .filter((p) => p.status === 'difficult' || p.lapses > 0)
      .sort((a, b) => b.lapses - a.lapses || (a.status === 'difficult' ? -1 : 1))
      .slice(0, 10),
    challengingWords,
    knownWords: vocabulary.filter((v) => v.status === 'known').length,
    totalWords: vocabulary.length,
  };
}
