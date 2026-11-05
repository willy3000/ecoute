import type Dexie from 'dexie';

/**
 * Ordered schema history. Never edit a released entry: append a new version
 * with only the stores that change, plus an upgrade function if existing rows
 * need rewriting. Dexie runs the steps a user is missing, in order, on open.
 */
export function applyMigrations(db: Dexie): void {
  db.version(1).stores({
    collections: 'id, order, title',
    phrases:
      'id, collectionId, [collectionId+order], status, dueAt, difficulty, category, register, *vocabularyTags, updatedAt',
    audio: 'id',
    vocabulary: 'id, french, category, status, partOfSpeech',
    reviews: '++id, phraseId, day, reviewedAt, rating',
    sessions: '++id, day, mode, startedAt',
    bookmarks: 'phraseId, createdAt',
    settings: 'key',
  });
}

/** Current schema version, used to label backups. */
export const SCHEMA_VERSION = 1;
