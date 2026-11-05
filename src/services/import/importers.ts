import { unzipSync, strFromU8 } from 'fflate';
import { createCollection, createPhrase, type PhraseInput } from '../../database/repositories/phrases';
import { db } from '../../database/schema/db';
import type { Difficulty, LibraryPackage, ManifestEntry, Register } from '../../types';
import { restoreBackup, type BackupFile } from '../export/backup';
import { parseCsv } from './csv';
import { mergeLibrary } from './seed';

export interface ImportReport {
  summary: string;
  skipped: string[];
}

const toDifficulty = (v: unknown): Difficulty => (v === 2 || v === '2' ? 2 : v === 3 || v === '3' ? 3 : 1);
const toRegister = (v: unknown): Register => (v === 'informal' ? 'informal' : 'standard');
const toTags = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [];
const optional = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function toInput(raw: Record<string, unknown>, collectionId: string): PhraseInput | null {
  const french = optional(raw.french);
  const english = optional(raw.english);
  if (!french || !english) return null;
  return {
    collectionId,
    french,
    english,
    spokenAlternative: optional(raw.spokenAlternative ?? raw.spoken_alternative),
    difficulty: toDifficulty(raw.difficulty),
    category: optional(raw.category) ?? 'Imported',
    vocabularyTags: toTags(raw.vocabularyTags ?? raw.tags),
    pronunciationNotes: optional(raw.pronunciationNotes ?? raw.pronunciation_notes ?? raw.notes),
    register: toRegister(raw.register),
  };
}

async function addAll(raws: Record<string, unknown>[], collectionId: string): Promise<ImportReport> {
  let added = 0;
  const skipped: string[] = [];
  const existing = new Set((await db.phrases.where('collectionId').equals(collectionId).toArray()).map((p) => p.french.trim().toLowerCase()));
  for (const [index, raw] of raws.entries()) {
    const input = toInput(raw, collectionId);
    if (!input) skipped.push(`Row ${index + 1}: needs both French and English text`);
    else if (existing.has(input.french.toLowerCase())) skipped.push(`Row ${index + 1}: already in this collection, "${input.french}"`);
    else {
      await createPhrase(input);
      existing.add(input.french.toLowerCase());
      added++;
    }
  }
  return { summary: `Added ${added} phrase${added === 1 ? '' : 's'}.`, skipped };
}

export async function importCsv(text: string, collectionId: string): Promise<ImportReport> {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('This CSV file is empty.');
  const cols = header.map((h) => h.trim().toLowerCase());
  if (!cols.includes('french') || !cols.includes('english')) throw new Error('The CSV header needs at least "french" and "english" columns.');
  return addAll(rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? '']))), collectionId);
}

export async function importJson(text: string, collectionId: string): Promise<ImportReport> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const list = Array.isArray(data) ? data : (data as { phrases?: unknown }).phrases;
  if (!Array.isArray(list)) throw new Error('Expected a list of phrases, or an object with a "phrases" list.');
  return addAll(list as Record<string, unknown>[], collectionId);
}

const audioName = /\.(mp3|m4a|ogg|opus|wav|webm)$/i;
const mimeFor = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : ext === 'wav' ? 'audio/wav' : ext === 'webm' ? 'audio/webm' : 'audio/ogg';
};
const baseName = (path: string) => path.split('/').pop()!.replace(audioName, '');

interface CollectionFile {
  format: 'ecoute-collection';
  collection: { title: string; description?: string };
  phrases: (Record<string, unknown> & { audioFile?: string })[];
}

/**
 * Handles every ZIP the app understands: a full backup, the starter library, a
 * collection export, or a plain audio package. A plain package only attaches a
 * recording whose filename, or manifest.json entry, names an exact phrase ID.
 * Nothing is matched approximately.
 */
export async function importZip(bytes: Uint8Array, targetCollectionId?: string): Promise<ImportReport> {
  const files = unzipSync(bytes);
  const json = <T,>(name: string): T | undefined => (files[name] ? (JSON.parse(strFromU8(files[name])) as T) : undefined);

  const backup = json<BackupFile>('backup.json');
  if (backup?.format === 'ecoute-backup') {
    await restoreBackup(backup, files);
    return { summary: `Restored backup: ${backup.phrases.length} phrases, ${backup.audioIndex.length} recordings, and your progress.`, skipped: [] };
  }

  const library = json<LibraryPackage>('library.json');
  if (library) {
    const manifest = json<{ entries: ManifestEntry[] }>('audio-manifest.json')?.entries;
    if (!manifest) throw new Error('This library package has no audio-manifest.json.');
    const r = await mergeLibrary(library, manifest, files);
    return { summary: `Starter library restored: ${r.phrasesAdded} phrases re-added, ${r.audioAdded} recordings stored. Existing progress was kept.`, skipped: [] };
  }

  const collection = json<CollectionFile>('collection.json');
  if (collection?.format === 'ecoute-collection') {
    const id = await createCollection(collection.collection.title, collection.collection.description);
    let audio = 0;
    const skipped: string[] = [];
    for (const raw of collection.phrases) {
      const input = toInput(raw, id);
      if (!input) {
        skipped.push(`Skipped an entry with missing text: ${String(raw.french ?? raw.id)}`);
        continue;
      }
      const data = raw.audioFile ? files[raw.audioFile] : undefined;
      if (raw.audioFile && !data) skipped.push(`Missing recording: ${raw.audioFile}`);
      await createPhrase(input, data ? new Blob([data.slice()], { type: mimeFor(raw.audioFile!) }) : undefined);
      if (data) audio++;
    }
    return { summary: `Imported "${collection.collection.title}" with ${collection.phrases.length - skipped.filter((s) => s.startsWith('Skipped')).length} phrases and ${audio} recordings.`, skipped };
  }

  // Plain audio package.
  const manifest = json<{ id: string; file: string }[] | { entries: { id: string; file: string }[] }>('manifest.json');
  const mapping = new Map<string, string>();
  if (manifest) {
    for (const e of Array.isArray(manifest) ? manifest : manifest.entries) mapping.set(e.file, e.id);
  }
  const names = Object.keys(files).filter((n) => audioName.test(n) && !n.startsWith('__MACOSX'));
  if (names.length === 0) throw new Error('No recordings or Écoute data were found in this ZIP.');
  let attached = 0;
  const skipped: string[] = [];
  for (const name of names) {
    const phraseId = mapping.get(name) ?? baseName(name);
    const phrase = await db.phrases.get(phraseId);
    if (!phrase || (targetCollectionId && phrase.collectionId !== targetCollectionId)) {
      skipped.push(`${name}: no phrase with ID "${phraseId}"${targetCollectionId ? ' in this collection' : ''}`);
      continue;
    }
    const type = mimeFor(name);
    await db.audio.put({ id: phraseId, blob: new Blob([files[name]!.slice()], { type }), mimeType: type, createdAt: Date.now() });
    await db.phrases.update(phraseId, { audioId: phraseId });
    attached++;
  }
  return { summary: `Attached ${attached} of ${names.length} recordings.`, skipped };
}
