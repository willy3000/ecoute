import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { href } from '../../app/router';
import { Button } from '../../components/ui';
import { db } from '../../database/schema/db';
import { CollectionForm } from './CollectionForm';
import { ImportDialog } from './ImportDialog';

export function CollectionsTab() {
  const data = useLiveQuery(async () => {
    const [collections, phrases] = await Promise.all([db.collections.orderBy('order').toArray(), db.phrases.toArray()]);
    return collections.map((c) => {
      const own = phrases.filter((p) => p.collectionId === c.id);
      return { ...c, total: own.length, started: own.filter((p) => p.status !== 'new').length, mastered: own.filter((p) => p.status === 'mastered').length };
    });
  }, []);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New collection
        </Button>
        <Button onClick={() => setImporting(true)}>
          <Upload size={16} /> Import
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data?.map((c) => (
          <li key={c.id}>
            <a href={href(`library/collection/${encodeURIComponent(c.id)}`)} className="flex h-full items-center gap-3 rounded-xl border border-ink-800 bg-ink-900 p-4 transition-colors hover:border-ink-600">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.title}</p>
                {c.titleFr ? <p lang="fr" className="french text-fg-muted">{c.titleFr}</p> : null}
                <p className="mt-1 text-sm text-fg-muted">
                  {c.total} phrases · {c.started} started · {c.mastered} mastered
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-800">
                  <div className="h-full rounded-full bg-teal" style={{ width: c.total ? `${(c.started / c.total) * 100}%` : '0%' }} />
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-fg-muted" />
            </a>
          </li>
        ))}
      </ul>
      {creating ? <CollectionForm onClose={() => setCreating(false)} /> : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
    </>
  );
}
