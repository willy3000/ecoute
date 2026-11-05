import { describe, expect, it } from 'vitest';
import type { ListeningSession, Phrase, ReviewRecord } from '../../types';
import { compareDictation } from './dictation';
import { schedule, type ScheduleFields } from './scheduler';
import { computeStats } from './stats';

const NOW = new Date('2026-11-05T12:00:00').getTime();
const DAY = 86_400_000;
const fresh: ScheduleFields = { status: 'new', dueAt: 0, intervalDays: 0, streak: 0, lapses: 0, reviewCount: 0 };
const daysUntil = (f: ScheduleFields) => (f.dueAt - NOW) / DAY;

describe('schedule', () => {
  it('brings unknown phrases back in the same session', () => {
    const r = schedule(fresh, 'unknown', NOW);
    expect(r.dueAt - NOW).toBeLessThan(DAY / 24);
    expect(r.status).toBe('learning');
    expect(r.lapses).toBe(1);
    expect(r.firstRating).toBe('unknown');
  });

  it('marks a repeated failure as difficult', () => {
    const once = schedule(fresh, 'unknown', NOW);
    expect(schedule(once, 'unknown', NOW).status).toBe('difficult');
  });

  it('schedules difficult for tomorrow', () => {
    const r = schedule(fresh, 'difficult', NOW);
    expect(daysUntil(r)).toBe(1);
    expect(r.status).toBe('difficult');
  });

  it('schedules understood-after-repetition in 2 to 3 days', () => {
    const first = schedule(fresh, 'repetition', NOW);
    expect(daysUntil(first)).toBe(2);
    expect(daysUntil(schedule(first, 'repetition', NOW))).toBe(3);
  });

  it('schedules immediate in 5 to 7 days, then extends to 14 to 30', () => {
    let s = schedule(fresh, 'immediate', NOW);
    expect(daysUntil(s)).toBe(5);
    expect(s.status).toBe('familiar');
    s = schedule(s, 'immediate', NOW);
    expect(daysUntil(s)).toBe(7);
    s = schedule(s, 'immediate', NOW);
    expect(daysUntil(s)).toBe(14);
    expect(s.status).toBe('mastered');
    s = schedule(s, 'immediate', NOW);
    expect(daysUntil(s)).toBe(28);
    s = schedule(s, 'immediate', NOW);
    expect(daysUntil(s)).toBe(30);
  });

  it('adapts downward when a mastered phrase is lost', () => {
    let s = fresh;
    for (let i = 0; i < 4; i++) s = schedule(s, 'immediate', NOW);
    const lost = schedule(s, 'difficult', NOW);
    expect(lost.status).toBe('difficult');
    expect(lost.streak).toBe(0);
    expect(daysUntil(lost)).toBe(1);
  });

  it('keeps the first rating for first-listen statistics', () => {
    const s = schedule(schedule(fresh, 'difficult', NOW), 'immediate', NOW);
    expect(s.firstRating).toBe('difficult');
  });
});

describe('compareDictation', () => {
  const FR = 'Qu’est-ce que tu veux ?';

  it('accepts an exact answer regardless of apostrophe style and punctuation', () => {
    expect(compareDictation(FR, "qu'est-ce que tu veux").perfect).toBe(true);
    expect(compareDictation('Il fait beau.', 'il fait beau').score).toBe(1);
  });

  it('separates accent slips from wrong words', () => {
    const r = compareDictation('Je suis déjà prêt.', 'je suis deja pret');
    expect(r.words.filter((w) => w.kind === 'accent').map((w) => w.kind === 'accent' && w.expected)).toEqual(['déjà', 'prêt']);
    expect(r.perfect).toBe(false);
    // Two half-errors across four words.
    expect(r.score).toBe(0.75);
  });

  it('identifies a wrong word in place', () => {
    const r = compareDictation('Je prends le bus.', 'Je prends le train.');
    expect(r.words[3]).toEqual({ kind: 'wrong', expected: 'bus', typed: 'train' });
    expect(r.score).toBe(0.75);
  });

  it('identifies missing and extra words', () => {
    expect(compareDictation('Je ne sais pas.', 'Je sais pas').words[1]).toEqual({ kind: 'missing', expected: 'ne' });
    expect(compareDictation('Je sais pas.', 'Je ne sais pas').words[1]).toEqual({ kind: 'extra', typed: 'ne' });
  });

  it('splits elisions into their own words', () => {
    const r = compareDictation('J’ai faim.', 'je ai faim');
    expect(r.words[0]).toEqual({ kind: 'wrong', expected: "J'", typed: 'je' });
    expect(r.words.slice(1).every((w) => w.kind === 'correct')).toBe(true);
  });

  it('scores an empty answer as zero', () => {
    const r = compareDictation('Bonjour !', '');
    expect(r.score).toBe(0);
    expect(r.perfect).toBe(false);
  });
});

describe('computeStats', () => {
  const phrase = (over: Partial<Phrase>): Phrase => ({
    id: 'a', collectionId: 'c', order: 1, french: 'x', english: 'x', difficulty: 1, category: 'c', vocabularyTags: [], register: 'standard',
    status: 'new', dueAt: 0, intervalDays: 0, streak: 0, lapses: 0, reviewCount: 0, listenCount: 0, builtIn: true, createdAt: 0, updatedAt: 0, ...over,
  });
  const review = (phraseId: string, rating: ReviewRecord['rating'], plays: number): ReviewRecord => ({ phraseId, rating, mode: 'listen', plays, reviewedAt: NOW, day: '2026-11-05' });
  const session = (seconds: number, day: string): ListeningSession => ({ mode: 'listen', startedAt: NOW, seconds, plays: 1, day });

  it('reports no rates before any data exists', () => {
    const s = computeStats([phrase({})], [], [], [], NOW);
    expect(s.firstListenRate).toBeNull();
    expect(s.averagePlays).toBeNull();
    expect(s.last7).toHaveLength(7);
    expect(s.last8Weeks).toHaveLength(8);
  });

  it('computes rates, durations and challenging vocabulary', () => {
    const s = computeStats(
      [phrase({ id: 'a', firstRating: 'immediate', status: 'mastered', vocabularyTags: ['bus'] }), phrase({ id: 'b', firstRating: 'difficult', status: 'difficult', lapses: 1, vocabularyTags: ['bus', 'train'] })],
      [review('a', 'immediate', 1), review('b', 'difficult', 3), review('b', 'unknown', 2)],
      [session(90, '2026-11-05'), session(30, '2026-11-04')],
      [],
      NOW,
    );
    expect(s.firstListenRate).toBe(0.5);
    expect(s.averagePlays).toBe(2);
    expect(s.totalSeconds).toBe(120);
    expect(s.last7.at(-1)?.seconds).toBe(90);
    expect(s.last7.at(-2)?.seconds).toBe(30);
    expect(s.byStatus.mastered).toBe(1);
    expect(s.difficultPhrases.map((p) => p.id)).toEqual(['b']);
    // Equal misses, so the word missed more often per rating ranks first.
    expect(s.challengingWords[0]).toEqual({ word: 'train', misses: 2, rated: 2 });
    expect(s.challengingWords[1]).toEqual({ word: 'bus', misses: 2, rated: 3 });
  });
});
