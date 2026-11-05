import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Field, Modal } from '../../components/ui';
import { db } from '../../database/schema/db';
import { importCsv, importJson, importZip, type ImportReport } from '../../services/import/importers';

/** Accepts CSV and JSON for a collection, and every kind of Écoute ZIP. */
export function ImportDialog({ collectionId, onClose }: { collectionId?: string; onClose: () => void }) {
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), []);
  const [target, setTarget] = useState(collectionId ?? '');
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [report, setReport] = useState<ImportReport>();

  const isZip = file?.name.toLowerCase().endsWith('.zip') ?? false;
  const destination = target || collections?.[0]?.id || '';
  const needsTarget = Boolean(file) && !isZip;

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const name = file.name.toLowerCase();
      if (isZip) setReport(await importZip(new Uint8Array(await file.arrayBuffer()), collectionId));
      else if (name.endsWith('.csv')) setReport(await importCsv(await file.text(), destination));
      else if (name.endsWith('.json')) setReport(await importJson(await file.text(), destination));
      else setError('Choose a .csv, .json or .zip file.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import"
      onClose={onClose}
      footer={
        report ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button variant="primary" disabled={!file || busy} onClick={() => void run()}>
            {busy ? 'Importing' : 'Import'}
          </Button>
        )
      }
    >
      {report ? (
        <div className="text-sm" data-testid="import-report">
          <p className="font-medium">{report.summary}</p>
          {report.skipped.length ? (
            <>
              <p className="mt-3 text-fg-muted">{report.skipped.length} skipped:</p>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-fg-soft">
                {report.skipped.slice(0, 100).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="File" hint="CSV needs french and english columns. Optional: spoken_alternative, difficulty, category, tags, pronunciation_notes, register.">
            <input
              type="file"
              accept=".csv,.json,.zip"
              className="field"
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                setError(undefined);
              }}
            />
          </Field>
          {isZip ? (
            <p className="text-sm text-fg-muted">
              A ZIP can be a backup, a collection export, the starter library, or recordings. Recordings attach only when the filename, or a manifest.json entry, is an exact phrase ID. A backup replaces everything on this device.
            </p>
          ) : null}
          {needsTarget ? (
            <Field label="Add to collection">
              <select className="field" value={destination} onChange={(e) => setTarget(e.target.value)}>
                {collections?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {error ? <p className="text-sm text-rose" role="alert">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}
