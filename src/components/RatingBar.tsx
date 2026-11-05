import type { Rating } from '../types';

export const RATINGS: { value: Rating; label: string; hint: string }[] = [
  { value: 'unknown', label: 'Lost', hint: 'Back later this session' },
  { value: 'difficult', label: 'Hard', hint: 'Tomorrow' },
  { value: 'repetition', label: 'After replays', hint: 'In 2–3 days' },
  { value: 'immediate', label: 'First time', hint: 'In 5+ days' },
];

export function RatingBar({ onRate, showKeys }: { onRate: (rating: Rating) => void; showKeys?: boolean }) {
  return (
    <div role="group" aria-label="How well did you understand?" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {RATINGS.map((r, i) => (
        <button key={r.value} type="button" onClick={() => onRate(r.value)} className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-2 text-center transition-colors hover:border-teal hover:bg-ink-850">
          <span className="block text-sm font-medium">
            {r.label}
            {showKeys ? <kbd className="ml-1.5 hidden text-xs font-normal text-fg-muted md:inline">{i + 1}</kbd> : null}
          </span>
          <span className="block text-xs text-fg-muted">{r.hint}</span>
        </button>
      ))}
    </div>
  );
}
