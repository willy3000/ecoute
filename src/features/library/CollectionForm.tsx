import { useState } from 'react';
import { Button, Field, Modal } from '../../components/ui';
import { createCollection, updateCollection } from '../../database/repositories/phrases';
import type { Collection } from '../../types';

export function CollectionForm({ collection, onClose, onCreated }: { collection?: Collection; onClose: () => void; onCreated?: (id: string) => void }) {
  const [title, setTitle] = useState(collection?.title ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (collection) await updateCollection(collection.id, { title: trimmed, description: description.trim() || undefined });
    else {
      const id = await createCollection(trimmed, description.trim() || undefined);
      onCreated?.(id);
    }
    onClose();
  };

  return (
    <Modal
      title={collection ? 'Edit collection' : 'New collection'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Description">
          <textarea className="field" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
