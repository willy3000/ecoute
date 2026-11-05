import { useState } from 'react';
import { formatDuration } from '../../utils/text';

export interface Bar {
  key: string;
  label: string;
  seconds: number;
  reviews: number;
}

const HEIGHT = 96;

/** One series of listening time: thin columns, hover or focus for values, plus a table view. */
export function ActivityChart({ title, bars, sparseLabels }: { title: string; bars: Bar[]; sparseLabels?: boolean }) {
  const [active, setActive] = useState<Bar>();
  const max = Math.max(...bars.map((b) => b.seconds), 1);
  const total = bars.reduce((sum, b) => sum + b.seconds, 0);
  const shown = active ?? null;

  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-sm text-fg-muted" aria-live="polite">
          {shown ? `${shown.label}: ${formatDuration(shown.seconds)}, ${shown.reviews} ratings` : `${formatDuration(total)} listening`}
        </p>
      </div>
      <div className="mt-3 flex items-end gap-0.5 border-b border-ink-700" style={{ height: HEIGHT }} onMouseLeave={() => setActive(undefined)}>
        {bars.map((b) => (
          <button
            key={b.key}
            type="button"
            aria-label={`${b.label}: ${formatDuration(b.seconds)}, ${b.reviews} ratings`}
            onMouseEnter={() => setActive(b)}
            onFocus={() => setActive(b)}
            onBlur={() => setActive(undefined)}
            className={`flex h-full flex-1 items-end justify-center rounded-t ${active?.key === b.key ? 'bg-ink-800' : ''}`}
          >
            <span className="block w-full max-w-6 rounded-t bg-teal" style={{ height: b.seconds ? Math.max(3, (b.seconds / max) * (HEIGHT - 4)) : 0 }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-xs text-fg-muted">
        {bars.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {!sparseLabels || i === 0 || i === bars.length - 1 ? b.label : ''}
          </span>
        ))}
      </div>
      <details className="mt-2 text-xs text-fg-muted">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-1 w-full text-left tabular-nums">
          <thead>
            <tr>
              <th className="py-0.5 font-medium">Period</th>
              <th className="font-medium">Listening</th>
              <th className="font-medium">Ratings</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key}>
                <td className="py-0.5">{b.label}</td>
                <td>{formatDuration(b.seconds)}</td>
                <td>{b.reviews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
