import { zipSync, strToU8 } from 'fflate';
import { SCHEMA_VERSION } from '../../database/migrations';
import { db } from '../../database/schema/db';
import type { AudioRecording, Bookmark, Collection, ListeningSession, Phrase, ReviewRecord, SettingRow, VocabularyEntry } from '../../types';
import { toCsv } from '../import/csv';
import { engine } from '../audio/engine';

export interface BackupFile {
  format: 'ecoute-backup';
  schemaVersion: number;
  exportedAt: string;
  collections: Collection[];
  phrases: Phrase[];
  vocabulary: VocabularyEntry[];
  reviews: ReviewRecord[];
  sessions: ListeningSession[];
  bookmarks: Bookmark[];
  settings: SettingRow[];
  audioIndex: (Omit<AudioRecording, 'blob'> & { file: string })[];
}

const extensionFor = (mime: string): string => {
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('webm')) return 'webm';
  return 'ogg';
};

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const today = () => new Date().toISOString().slice(0, 10);
const asZip = (files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]>) => {
  const data = zipSync(files, { level: 0 });
  return new Blob([data.slice()], { type: 'application/zip' });
};

/** A full snapshot: library, recordings, progress, and settings. */
export async function createBackup(): Promise<Blob> {
  const audio = await db.audio.toArray();
  const files: Record<string, Uint8Array> = {};
  const audioIndex: BackupFile['audioIndex'] = [];
  for (const { blob, ...meta } of audio) {
    const file = `audio/${meta.id}.${extensionFor(meta.mimeType)}`;
    files[file] = new Uint8Array(await blob.arrayBuffer());
    audioIndex.push({ ...meta, file });
  }
  const backup: BackupFile = {
    format: 'ecoute-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    collections: await db.collections.toArray(),
    phrases: await db.phrases.toArray(),
    vocabulary: await db.vocabulary.toArray(),
    reviews: await db.reviews.toArray(),
    sessions: await db.sessions.toArray(),
    bookmarks: await db.bookmarks.toArray(),
    settings: await db.settings.toArray(),
    audioIndex,
  };
  files['backup.json'] = strToU8(JSON.stringify(backup));
  return asZip(files);
}

export const backupFilename = () => `ecoute-backup-${today()}.zip`;

/** Replaces everything in the database with the backup, as one all-or-nothing change. */
export async function restoreBackup(backup: BackupFile, files: Record<string, Uint8Array>): Promise<void> {
  if (backup.schemaVersion > SCHEMA_VERSION) throw new Error('This backup comes from a newer version of Écoute. Update the app first.');
  const audio: AudioRecording[] = [];
  for (const { file, ...meta } of backup.audioIndex) {
    const data = files[file];
    if (!data) throw new Error(`The backup is damaged: ${file} is missing. Nothing was changed.`);
    audio.push({ ...meta, blob: new Blob([data.slice()], { type: meta.mimeType }) });
  }
  engine.stop();
  engine.clearCache();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.collections.bulkPut(backup.collections);
    await db.phrases.bulkPut(backup.phrases);
    await db.vocabulary.bulkPut(backup.vocabulary);
    await db.reviews.bulkPut(backup.reviews);
    await db.sessions.bulkPut(backup.sessions);
    await db.bookmarks.bulkPut(backup.bookmarks);
    await db.settings.bulkPut(backup.settings);
    await db.audio.bulkPut(audio);
  });
}

const slug = (title: string) => title.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';

const shareable = (p: Phrase) => ({
  french: p.french,
  english: p.english,
  spokenAlternative: p.spokenAlternative,
  difficulty: p.difficulty,
  category: p.category,
  vocabularyTags: p.vocabularyTags,
  pronunciationNotes: p.pronunciationNotes,
  register: p.register,
});

/** ZIP with phrases and recordings, reimportable on any device. */
export async function exportCollectionZip(collectionId: string): Promise<{ blob: Blob; filename: string }> {
  const collection = await db.collections.get(collectionId);
  if (!collection) throw new Error('Collection not found.');
  const phrases = await db.phrases.where('collectionId').equals(collectionId).sortBy('order');
  const files: Record<string, Uint8Array> = {};
  const rows = [];
  for (const p of phrases) {
    const rec = p.audioId ? await db.audio.get(p.audioId) : undefined;
    let audioFile: string | undefined;
    if (rec) {
      audioFile = `audio/${p.id}.${extensionFor(rec.mimeType)}`;
      files[audioFile] = new Uint8Array(await rec.blob.arrayBuffer());
    }
    rows.push({ id: p.id, ...shareable(p), audioFile });
  }
  files['collection.json'] = strToU8(
    JSON.stringify({ format: 'ecoute-collection', collection: { title: collection.title, description: collection.description }, phrases: rows }, null, 2),
  );
  return { blob: asZip(files), filename: `ecoute-${slug(collection.title)}.zip` };
}

export async function exportCollectionCsv(collectionId: string): Promise<{ blob: Blob; filename: string }> {
  const collection = await db.collections.get(collectionId);
  if (!collection) throw new Error('Collection not found.');
  const phrases = await db.phrases.where('collectionId').equals(collectionId).sortBy('order');
  const csv = toCsv([
    ['id', 'french', 'english', 'spoken_alternative', 'difficulty', 'category', 'tags', 'pronunciation_notes', 'register'],
    ...phrases.map((p) => [p.id, p.french, p.english, p.spokenAlternative, p.difficulty, p.category, p.vocabularyTags.join('; '), p.pronunciationNotes, p.register]),
  ]);
  return { blob: new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), filename: `ecoute-${slug(collection.title)}.csv` };
}

export async function exportCollectionJson(collectionId: string): Promise<{ blob: Blob; filename: string }> {
  const collection = await db.collections.get(collectionId);
  if (!collection) throw new Error('Collection not found.');
  const phrases = await db.phrases.where('collectionId').equals(collectionId).sortBy('order');
  const body = { title: collection.title, description: collection.description, phrases: phrases.map(shareable) };
  return { blob: new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }), filename: `ecoute-${slug(collection.title)}.json` };
}

/** Clears progress but leaves the library and recordings in place. */
export async function resetProgress(): Promise<void> {
  await db.transaction('rw', db.phrases, db.reviews, db.sessions, db.bookmarks, async () => {
    await db.reviews.clear();
    await db.sessions.clear();
    await db.bookmarks.clear();
    await db.phrases.toCollection().modify((p) => {
      p.status = 'new';
      p.dueAt = 0;
      p.intervalDays = 0;
      p.streak = 0;
      p.lapses = 0;
      p.reviewCount = 0;
      p.listenCount = 0;
      delete p.firstRating;
      delete p.lastReviewedAt;
    });
  });
}

/** Removes everything. The app reinstalls the starter library on next launch. */
export async function clearAllData(): Promise<void> {
  engine.stop();
  engine.clearCache();
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())));
}
