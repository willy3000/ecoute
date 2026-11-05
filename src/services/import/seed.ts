import { unzipSync } from 'fflate';
import { getSettings, updateSettings } from '../../database/repositories/settings';
import { db } from '../../database/schema/db';
import type { AudioRecording, Collection, LibraryPackage, ManifestEntry, Phrase, VocabularyEntry } from '../../types';
import { freshLearningState } from '../../database/repositories/phrases';

export const LIBRARY_URL = 'content/library.json';
export const MANIFEST_URL = 'content/audio-manifest.json';
export const AUDIO_PACK_URL = 'content/ecoute-audio-v1.zip';

export interface SeedProgress {
  stage: 'library' | 'audio' | 'storing' | 'done';
  /** 0 to 1 within the current stage. */
  fraction: number;
}

async function fetchChecked(url: string): Promise<Response> {
  const res = await fetch(new URL(url, document.baseURI));
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function fetchBytes(url: string, onFraction: (f: number) => void): Promise<Uint8Array> {
  const res = await fetchChecked(url);
  // With compression, Content-Length is the compressed size while the stream yields
  // decompressed bytes. So it only ever estimates progress and never sizes a buffer.
  const total = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onFraction(Math.min(1, received / total));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Adds what is missing and refreshes unedited built-in text. Learning progress is never touched. */
export async function mergeLibrary(
  library: LibraryPackage,
  manifest: ManifestEntry[],
  files: Record<string, Uint8Array>,
  onFraction: (f: number) => void = () => {},
): Promise<{ phrasesAdded: number; audioAdded: number }> {
  const now = Date.now();
  const byFile = new Map(manifest.map((m) => [m.file, m]));
  const audioIdFor = (file: string): string | undefined => (files[file] ? byFile.get(file)?.id : undefined);

  // Audio is written in batches so a large library never holds one huge transaction.
  const entries = manifest.filter((m) => files[m.file]);
  const BATCH = 100;
  let audioAdded = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const rows: AudioRecording[] = entries.slice(i, i + BATCH).map((m) => ({
      id: m.id,
      blob: new Blob([files[m.file]!.slice()], { type: 'audio/mpeg' }),
      mimeType: 'audio/mpeg',
      durationSeconds: m.durationSeconds,
      provider: m.provider,
      voice: m.voice,
      createdAt: now,
    }));
    await db.audio.bulkPut(rows);
    audioAdded += rows.length;
    onFraction(Math.min(1, (i + BATCH) / entries.length));
  }

  let phrasesAdded = 0;
  await db.transaction('rw', db.collections, db.phrases, db.vocabulary, async () => {
    const existingCollections = new Map((await db.collections.toArray()).map((c) => [c.id, c]));
    const collections: Collection[] = library.collections.map((c) => {
      const prior = existingCollections.get(c.id);
      return prior && prior.updatedAt > prior.createdAt ? prior : { ...c, builtIn: true, createdAt: prior?.createdAt ?? now, updatedAt: prior?.updatedAt ?? now };
    });
    await db.collections.bulkPut(collections);

    const existingPhrases = new Map((await db.phrases.where('id').anyOf(library.phrases.map((p) => p.id)).toArray()).map((p) => [p.id, p]));
    const phrases: Phrase[] = library.phrases.map(({ audioFile, ...p }) => {
      const prior = existingPhrases.get(p.id);
      if (prior && prior.updatedAt > prior.createdAt) return prior; // The user edited it.
      if (prior) return { ...prior, ...p, audioId: audioIdFor(audioFile) ?? prior.audioId };
      phrasesAdded++;
      return { ...p, audioId: audioIdFor(audioFile), ...freshLearningState(), builtIn: true, createdAt: now, updatedAt: now };
    });
    await db.phrases.bulkPut(phrases);

    const existingWords = new Map((await db.vocabulary.where('id').anyOf(library.vocabulary.map((v) => v.id)).toArray()).map((v) => [v.id, v]));
    const words: VocabularyEntry[] = library.vocabulary.map(({ audioFile, exampleAudioFile, ...v }) => {
      const prior = existingWords.get(v.id);
      if (prior && prior.updatedAt > prior.createdAt) return prior;
      return {
        ...v,
        audioId: audioIdFor(audioFile) ?? prior?.audioId,
        exampleAudioId: audioIdFor(exampleAudioFile) ?? prior?.exampleAudioId,
        status: prior?.status ?? 'unknown',
        builtIn: true,
        createdAt: prior?.createdAt ?? now,
        updatedAt: prior?.updatedAt ?? now,
      };
    });
    await db.vocabulary.bulkPut(words);
  });
  return { phrasesAdded, audioAdded };
}

/** Downloads the starter package and merges it. Safe to rerun after a failure. */
export async function installStarterLibrary(onProgress: (p: SeedProgress) => void): Promise<void> {
  onProgress({ stage: 'library', fraction: 0 });
  const library = (await (await fetchChecked(LIBRARY_URL)).json()) as LibraryPackage;
  const manifest = ((await (await fetchChecked(MANIFEST_URL)).json()) as { entries: ManifestEntry[] }).entries;
  onProgress({ stage: 'audio', fraction: 0 });
  const zip = await fetchBytes(AUDIO_PACK_URL, (fraction) => onProgress({ stage: 'audio', fraction }));
  onProgress({ stage: 'storing', fraction: 0 });
  const files = unzipSync(zip, { filter: (f) => f.name.endsWith('.mp3') });
  await mergeLibrary(library, manifest, files, (fraction) => onProgress({ stage: 'storing', fraction }));
  await updateSettings({ seededContentVersion: library.contentVersion });
  onProgress({ stage: 'done', fraction: 1 });
}

export async function needsSeeding(): Promise<boolean> {
  const settings = await getSettings();
  return settings.seededContentVersion === 0;
}
