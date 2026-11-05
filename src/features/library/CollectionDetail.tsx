import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Download, Headphones, Pencil, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { href, navigate } from '../../app/router';
import { Button, ConfirmDialog, Field, Modal } from '../../components/ui';
import { deleteCollection } from '../../database/repositories/phrases';
import { updateSettings } from '../../database/repositories/settings';
import { db } from '../../database/schema/db';
import { downloadBlob, exportCollectionCsv, exportCollectionJson, exportCollectionZip } from '../../services/export/backup';
import { CollectionForm } from './CollectionForm';
import { ImportDialog } from './ImportDialog';
import { PhraseBrowser } from './PhraseBrowser';

type ExportKind = 'zip' | 'csv' | 'json';

export function CollectionDetail({ id }: { id: string }) {
  const collection = useLiveQuery(() => db.collections.get(id), [id]);
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'import' | 'export'>();
  const [exportKind, setExportKind] = useState<ExportKind>('zip');
  const [exporting, setExporting] = useState(false);

  if (!collection) return <p className="p-8 text-fg-muted">Loading collection</p>;

  const remove = async () => {
    await deleteCollection(id);
    navigate('library');
  };
  const listen = async () => {
    await updateSettings({ lastCollectionId: id });
    navigate('listen');
  };
  const runExport = async () => {
    setExporting(true);
    const { blob, filename } = await (exportKind === 'zip' ? exportCollectionZip(id) : exportKind === 'csv' ? exportCollectionCsv(id) : exportCollectionJson(id));
    downloadBlob(blob, filename);
    setExporting(false);
    setDialog(undefined);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 md:px-8 md:py-8">
      <a href={href('library')} className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} /> All collections
      </a>
      <h1 className="text-2xl font-semibold tracking-tight">{collection.title}</h1>
      {collection.titleFr ? <p lang="fr" className="french text-lg text-fg-muted">{collection.titleFr}</p> : null}
      {collection.description ? <p className="mt-1 text-sm text-fg-soft">{collection.description}</p> : null}
      <div className="mt-4 mb-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void listen()}>
          <Headphones size={16} /> Listen
        </Button>
        <Button onClick={() => setDialog('edit')}>
          <Pencil size={15} /> Edit
        </Button>
        <Button onClick={() => setDialog('import')}>
          <Upload size={15} /> Import
        </Button>
        <Button onClick={() => setDialog('export')}>
          <Download size={15} /> Export
        </Button>
        <Button variant="danger" onClick={() => setDialog('delete')}>
          <Trash2 size={15} /> Delete
        </Button>
      </div>

      <PhraseBrowser collectionId={id} key={id} />

      {dialog === 'edit' ? <CollectionForm collection={collection} onClose={() => setDialog(undefined)} /> : null}
      {dialog === 'import' ? <ImportDialog collectionId={id} onClose={() => setDialog(undefined)} /> : null}
      {dialog === 'delete' ? (
        <ConfirmDialog
          title="Delete this collection?"
          body={`"${collection.title}", all its phrases, their recordings and their progress will be removed from this device.${collection.builtIn ? ' You can bring built-in collections back from Settings with "Restore starter library".' : ''}`}
          confirmLabel="Delete collection"
          onConfirm={() => void remove()}
          onCancel={() => setDialog(undefined)}
        />
      ) : null}
      {dialog === 'export' ? (
        <Modal
          title="Export collection"
          onClose={() => setDialog(undefined)}
          footer={
            <Button variant="primary" disabled={exporting} onClick={() => void runExport()}>
              {exporting ? 'Preparing' : 'Download'}
            </Button>
          }
        >
          <Field label="Format">
            <select className="field" value={exportKind} onChange={(e) => setExportKind(e.target.value as ExportKind)}>
              <option value="zip">ZIP with recordings</option>
              <option value="csv">CSV, text only</option>
              <option value="json">JSON, text only</option>
            </select>
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}
