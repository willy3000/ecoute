import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/schema/db';
import type { Phrase } from '../types';
import { RegisterBadge } from './ui';

/** Notes shown after the transcript is revealed: register, linked forms, pronunciation. */
export function PhraseDetails({ phrase }: { phrase: Phrase }) {
  const relatedIds = [phrase.linkedPhraseId, ...(phrase.informalPhraseIds ?? [])].filter((x): x is string => Boolean(x));
  const related = useLiveQuery(() => db.phrases.bulkGet(relatedIds), [relatedIds.join()]);

  const hasNotes = phrase.register === 'informal' || phrase.spokenAlternative || phrase.pronunciationNotes || relatedIds.length > 0;
  if (!hasNotes) return null;
  return (
    <div className="mt-4 space-y-2 border-t border-ink-800 pt-3 text-sm text-fg-soft">
      {phrase.register === 'informal' ? <RegisterBadge /> : null}
      {phrase.pronunciationNotes ? <p>{phrase.pronunciationNotes}</p> : null}
      {phrase.spokenAlternative ? (
        <p>
          <span className="text-fg-muted">In relaxed speech: </span>
          <span className="french text-base text-fg">{phrase.spokenAlternative}</span>
        </p>
      ) : null}
      {related?.map((r) =>
        r ? (
          <p key={r.id}>
            <span className="text-fg-muted">{r.register === 'informal' ? 'Informal form: ' : 'Standard form: '}</span>
            <span className="french text-base text-fg">{r.french}</span>
          </p>
        ) : null,
      )}
    </div>
  );
}
