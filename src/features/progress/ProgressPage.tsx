import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Page } from '../../components/ui';
import { db } from '../../database/schema/db';
import { computeStats } from '../../services/learning/stats';
import type { LearningStatus } from '../../types';
import { formatDuration } from '../../utils/text';
import { ActivityChart } from './ActivityChart';

// A single ordered ramp from untouched to secure, so identity also reads as progression.
const STATUS_ORDER: { key: LearningStatus; label: string; color: string }[] = [
  { key: 'new', label: 'New', color: '#42516b' },
  { key: 'difficult', label: 'Difficult', color: '#e2b866' },
  { key: 'learning', label: 'Learning', color: '#1f7a74' },
  { key: 'familiar', label: 'Familiar', color: '#4fbfb1' },
  { key: 'mastered', label: 'Mastered', color: '#a6ece2' },
];

export function ProgressPage() {
  const raw = useLiveQuery(async () => {
    const [phrases, reviews, sessions, vocabulary] = await Promise.all([db.phrases.toArray(), db.reviews.toArray(), db.sessions.toArray(), db.vocabulary.toArray()]);
    return { phrases, reviews, sessions, vocabulary };
  }, []);
  const stats = useMemo(() => (raw ? computeStats(raw.phrases, raw.reviews, raw.sessions, raw.vocabulary) : undefined), [raw]);
  if (!stats) return <p className="p-8 text-fg-muted">Loading progress</p>;

  return (
    <Page title="Progress" subtitle="Measures of listening, nothing else.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Listening time" value={formatDuration(stats.totalSeconds)} testId="stat-time" />
        <Tile label="First-listen understanding" value={stats.firstListenRate === null ? 'No data yet' : `${Math.round(stats.firstListenRate * 100)}%`} hint={stats.ratedPhrases ? `${stats.ratedPhrases} phrases rated` : undefined} testId="stat-first" />
        <Tile label="Plays before rating" value={stats.averagePlays === null ? 'No data yet' : stats.averagePlays.toFixed(1)} hint="On average" testId="stat-plays" />
        <Tile label="Mastered" value={`${stats.byStatus.mastered} of ${stats.totalPhrases}`} testId="stat-mastered" />
      </div>

      <section className="mt-6 rounded-xl border border-ink-800 bg-ink-900 p-4">
        <h2 className="text-sm font-semibold">Library status</h2>
        <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={STATUS_ORDER.map((s) => `${s.label} ${stats.byStatus[s.key]}`).join(', ')}>
          {STATUS_ORDER.filter((s) => stats.byStatus[s.key] > 0).map((s) => (
            <div key={s.key} title={`${s.label}: ${stats.byStatus[s.key]}`} style={{ flexGrow: stats.byStatus[s.key], background: s.color }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-soft">
          {STATUS_ORDER.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              {s.label} <span className="text-fg-muted tabular-nums" data-testid={`status-${s.key}`}>{stats.byStatus[s.key]}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ActivityChart title="This week" bars={stats.last7.map((d) => ({ key: d.day, label: d.label, seconds: d.seconds, reviews: d.reviews }))} />
        <ActivityChart title="Last eight weeks" bars={stats.last8Weeks.map((w) => ({ key: w.start, label: w.label, seconds: w.seconds, reviews: w.reviews }))} sparseLabels />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-ink-800 bg-ink-900 p-4">
          <h2 className="text-sm font-semibold">Difficult phrases</h2>
          {stats.difficultPhrases.length ? (
            <ul className="mt-2 space-y-1.5">
              {stats.difficultPhrases.map((p) => (
                <li key={p.id}>
                  <span lang="fr" className="french block">{p.french}</span>
                  <span className="text-sm text-fg-muted">{p.english}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">Phrases you rate as Lost or Hard will appear here.</p>
          )}
        </section>
        <section className="rounded-xl border border-ink-800 bg-ink-900 p-4">
          <h2 className="text-sm font-semibold">Most challenging vocabulary</h2>
          {stats.challengingWords.length ? (
            <ul className="mt-2 space-y-1">
              {stats.challengingWords.map((w) => (
                <li key={w.word} className="flex items-baseline justify-between gap-2">
                  <span lang="fr" className="french">{w.word}</span>
                  <span className="text-sm text-fg-muted tabular-nums">
                    missed {w.misses} of {w.rated}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">Words from phrases you find hard will appear here.</p>
          )}
          <p className="mt-3 border-t border-ink-800 pt-2 text-sm text-fg-muted">
            {stats.knownWords} of {stats.totalWords} vocabulary words marked as known.
          </p>
        </section>
      </div>
    </Page>
  );
}

function Tile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId: string }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900 p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold" data-testid={testId}>{value}</p>
      {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}
