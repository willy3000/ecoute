import type { Collection, Difficulty, Phrase, Register } from '../../types';
import { db } from '../schema/db';

export interface PhraseInput {
  collectionId: string;
  french: string;
  english: string;
  spokenAlternative?: string;
  difficulty: Difficulty;
  category: string;
  vocabularyTags: string[];
  pronunciationNotes?: string;
  register: Register;
}

/** A phrase in its untouched learning state. */
export function freshLearningState() {
  return { status: 'new', dueAt: 0, intervalDays: 0, streak: 0, lapses: 0, reviewCount: 0, listenCount: 0 } as const;
}

const inCollection = (collectionId: string) => db.phrases.where('[collectionId+order]').between([collectionId, -Infinity], [collectionId, Infinity]);

export function phrasesInCollection(collectionId: string): Promise<Phrase[]> {
  return inCollection(collectionId).toArray();
}

export async function createPhrase(input: PhraseInput, audio?: Blob): Promise<string> {
  const id = `user-${crypto.randomUUID()}`;
  const now = Date.now();
  await db.transaction('rw', db.phrases, db.audio, async () => {
    const last = await inCollection(input.collectionId).last();
    let audioId: string | undefined;
    if (audio) {
      audioId = id;
      await db.audio.put({ id, blob: audio, mimeType: audio.type || 'audio/mpeg', createdAt: now });
    }
    await db.phrases.add({ ...input, id, audioId, order: (last?.order ?? 0) + 1, ...freshLearningState(), builtIn: false, createdAt: now, updatedAt: now });
  });
  return id;
}

export async function updatePhrase(id: string, input: PhraseInput, audio?: Blob | null): Promise<void> {
  await db.transaction('rw', db.phrases, db.audio, async () => {
    const patch: Partial<Phrase> = { ...input, updatedAt: Date.now() };
    if (audio) {
      await db.audio.put({ id, blob: audio, mimeType: audio.type || 'audio/mpeg', createdAt: Date.now() });
      patch.audioId = id;
    } else if (audio === null) {
      await db.audio.delete(id);
      patch.audioId = undefined;
    }
    await db.phrases.update(id, patch);
  });
}

export async function deletePhrase(id: string): Promise<void> {
  await db.transaction('rw', [db.phrases, db.audio, db.bookmarks, db.reviews], async () => {
    const phrase = await db.phrases.get(id);
    if (phrase?.audioId) await db.audio.delete(phrase.audioId);
    await db.bookmarks.delete(id);
    await db.reviews.where('phraseId').equals(id).delete();
    await db.phrases.delete(id);
  });
}

export async function createCollection(title: string, description?: string): Promise<string> {
  const id = `user-${crypto.randomUUID()}`;
  const last = await db.collections.orderBy('order').last();
  const now = Date.now();
  await db.collections.add({ id, title, description, order: (last?.order ?? 0) + 1, builtIn: false, createdAt: now, updatedAt: now });
  return id;
}

export async function updateCollection(id: string, patch: Pick<Collection, 'title' | 'description'>): Promise<void> {
  await db.collections.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteCollection(id: string): Promise<void> {
  await db.transaction('rw', [db.collections, db.phrases, db.audio, db.bookmarks, db.reviews], async () => {
    const phrases = await db.phrases.where('collectionId').equals(id).toArray();
    const ids = phrases.map((p) => p.id);
    await db.audio.bulkDelete(phrases.flatMap((p) => (p.audioId ? [p.audioId] : [])));
    await db.bookmarks.bulkDelete(ids);
    await db.reviews.where('phraseId').anyOf(ids).delete();
    await db.phrases.bulkDelete(ids);
    await db.collections.delete(id);
  });
}

export async function toggleBookmark(phraseId: string): Promise<boolean> {
  const existing = await db.bookmarks.get(phraseId);
  if (existing) {
    await db.bookmarks.delete(phraseId);
    return false;
  }
  await db.bookmarks.put({ phraseId, createdAt: Date.now() });
  return true;
}
