import Dexie from 'dexie';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup, clearAllData, exportCollectionCsv, resetProgress } from '../services/export/backup';
import { parseCsv, toCsv } from '../services/import/csv';
import { importCsv, importJson, importZip } from '../services/import/importers';
import { mergeLibrary } from '../services/import/seed';
import { dueQueue, ratePhrase } from '../services/learning/review';
import type { LibraryPackage, ManifestEntry } from '../types';
import { applyMigrations, SCHEMA_VERSION } from './migrations';
import { createCollection, createPhrase, deleteCollection, deletePhrase, toggleBookmark, updatePhrase } from './repositories/phrases';
import { getSettings, updateSettings } from './repositories/settings';
import { phraseContainsWord } from './repositories/vocabulary';
import { db } from './schema/db';

const library: LibraryPackage = {
  contentVersion: 1,
  collections: [{ id: 'greetings', title: 'Greetings', titleFr: 'Salutations', description: 'd', order: 0 }],
  phrases: [
    { id: 'greeting-001', collectionId: 'greetings', order: 1, french: 'Bonjour !', english: 'Hello!', difficulty: 1, category: 'Greetings', vocabularyTags: ['bonjour'], register: 'standard', audioFile: 'audio/greetings/greeting-001.mp3' },
    { id: 'greeting-002', collectionId: 'greetings', order: 2, french: 'Salut !', english: 'Hi!', difficulty: 1, category: 'Greetings', vocabularyTags: [], register: 'informal', audioFile: 'audio/greetings/greeting-002.mp3' },
  ],
  vocabulary: [{ id: 'vocab-001', french: 'bonjour', english: 'hello', partOfSpeech: 'interjection', pronunciation: '/x/', exampleFrench: 'Bonjour.', exampleEnglish: 'Hello.', category: 'Greetings', forms: [], audioFile: 'audio/vocabulary/vocab-001.mp3', exampleAudioFile: 'audio/vocabulary/vocab-001-ex.mp3' }],
};
const entry = (id: string, file: string): ManifestEntry => ({ id, file, kind: 'phrase', french: 'x', english: 'x', provider: 'p', voice: 'v', language: 'fr-FR', durationSeconds: 1, status: 's' });
const manifest = [entry('greeting-001', library.phrases[0]!.audioFile), entry('greeting-002', library.phrases[1]!.audioFile), entry('vocab-001', library.vocabulary[0]!.audioFile)];
const files = () => Object.fromEntries(manifest.map((m) => [m.file, new Uint8Array([1, 2, 3, m.id.length])]));

beforeEach(async () => {
  await clearAllData();
});

describe('migrations', () => {
  it('opens at the current version with every store', () => {
    expect(db.verno).toBeGreaterThanOrEqual(0);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['audio', 'bookmarks', 'collections', 'phrases', 'reviews', 'sessions', 'settings', 'vocabulary']);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('upgrades existing data when a later version appears', async () => {
    const name = `migration-${Date.now()}`;
    const v1 = new Dexie(name);
    applyMigrations(v1);
    await v1.table('phrases').add({ id: 'p', collectionId: 'c', order: 1, french: 'Oui.' });
    v1.close();
    const v2 = new Dexie(name);
    applyMigrations(v2);
    v2.version(2).stores({ phrases: 'id, collectionId, [collectionId+order], status, dueAt, difficulty, category, register, *vocabularyTags, updatedAt, french' }).upgrade((tx) =>
      tx.table('phrases').toCollection().modify((p: { migrated?: boolean }) => {
        p.migrated = true;
      }),
    );
    await v2.open();
    const row = await v2.table('phrases').where('french').equals('Oui.').first();
    expect(row.migrated).toBe(true);
    v2.close();
    await Dexie.delete(name);
  });
});

describe('seeding', () => {
  it('installs phrases, vocabulary and exact audio links', async () => {
    const r = await mergeLibrary(library, manifest, files());
    expect(r.phrasesAdded).toBe(2);
    const p = await db.phrases.get('greeting-001');
    expect(p?.audioId).toBe('greeting-001');
    expect(p?.status).toBe('new');
    expect(await db.audio.count()).toBe(3);
    const word = await db.vocabulary.get('vocab-001');
    expect(word?.audioId).toBe('vocab-001');
    expect(word?.exampleAudioId).toBeUndefined();
  });

  it('never overwrites learning progress or user edits when rerun', async () => {
    await mergeLibrary(library, manifest, files());
    await ratePhrase('greeting-001', 'immediate', 'listen', 1);
    await updatePhrase('greeting-002', { collectionId: 'greetings', french: 'Salut, toi !', english: 'Hi, you!', difficulty: 1, category: 'Greetings', vocabularyTags: [], register: 'informal' });
    await deletePhrase('greeting-001');
    await ratePhrase('greeting-002', 'difficult', 'listen', 1);
    const r = await mergeLibrary(library, manifest, files());
    expect(r.phrasesAdded).toBe(1);
    expect((await db.phrases.get('greeting-002'))?.french).toBe('Salut, toi !');
    expect((await db.phrases.get('greeting-002'))?.status).toBe('difficult');
  });
});

describe('phrases and collections', () => {
  it('creates, edits and deletes, cleaning up related rows', async () => {
    const c = await createCollection('Mine');
    const id = await createPhrase({ collectionId: c, french: 'Oui.', english: 'Yes.', difficulty: 1, category: 'x', vocabularyTags: [], register: 'standard' }, new Blob(['a'], { type: 'audio/mpeg' }));
    const second = await createPhrase({ collectionId: c, french: 'Non.', english: 'No.', difficulty: 1, category: 'x', vocabularyTags: [], register: 'standard' });
    expect((await db.phrases.get(second))?.order).toBe(2);
    await toggleBookmark(id);
    await ratePhrase(id, 'difficult', 'listen', 1);
    await updatePhrase(id, { collectionId: c, french: 'Oui !', english: 'Yes!', difficulty: 2, category: 'x', vocabularyTags: ['oui'], register: 'standard' });
    expect((await db.phrases.get(id))?.french).toBe('Oui !');
    expect((await db.phrases.get(id))?.audioId).toBe(id);
    await updatePhrase(id, { collectionId: c, french: 'Oui !', english: 'Yes!', difficulty: 2, category: 'x', vocabularyTags: [], register: 'standard' }, null);
    expect((await db.phrases.get(id))?.audioId).toBeUndefined();
    await deleteCollection(c);
    expect(await db.phrases.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
    expect(await db.bookmarks.count()).toBe(0);
    expect(await db.collections.count()).toBe(0);
  });

  it('matches vocabulary on whole words only', () => {
    expect(phraseContainsWord({ french: 'Il a deux enfants.' }, { french: 'avoir', forms: ['a', 'ai'] })).toBe(true);
    expect(phraseContainsWord({ french: 'Ta sœur.' }, { french: 'avoir', forms: ['a'] })).toBe(false);
    expect(phraseContainsWord({ french: 'J’ai faim.' }, { french: 'avoir', forms: ['ai'] })).toBe(true);
    expect(phraseContainsWord({ french: 'C’est à côté de la gare.' }, { french: 'gare', forms: [] })).toBe(true);
  });
});

describe('reviews', () => {
  it('queues only due phrases, most overdue first', async () => {
    await mergeLibrary(library, manifest, files());
    const now = Date.now();
    await ratePhrase('greeting-001', 'difficult', 'review', 2, now - 3 * 86_400_000);
    await ratePhrase('greeting-002', 'difficult', 'review', 1, now - 2 * 86_400_000);
    expect((await dueQueue(undefined, now)).map((p) => p.id)).toEqual(['greeting-001', 'greeting-002']);
    await ratePhrase('greeting-001', 'immediate', 'review', 1, now);
    expect((await dueQueue(undefined, now)).map((p) => p.id)).toEqual(['greeting-002']);
    expect(await db.reviews.count()).toBe(3);
  });

  it('reset clears progress but keeps the library', async () => {
    await mergeLibrary(library, manifest, files());
    await ratePhrase('greeting-001', 'immediate', 'review', 1);
    await toggleBookmark('greeting-001');
    await resetProgress();
    const p = await db.phrases.get('greeting-001');
    expect(p?.status).toBe('new');
    expect(p?.firstRating).toBeUndefined();
    expect(await db.reviews.count()).toBe(0);
    expect(await db.bookmarks.count()).toBe(0);
    expect(await db.audio.count()).toBe(3);
  });
});

describe('import and export', () => {
  it('parses quoted CSV and round-trips special characters', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']]);
    const text = toCsv([['french', 'english'], ['Ça va, merci.', 'I\'m "fine"']]);
    expect(parseCsv(text)[1]).toEqual(['Ça va, merci.', 'I\'m "fine"']);
  });

  it('imports CSV, reports bad rows, and skips duplicates', async () => {
    const c = await createCollection('Mine');
    const r = await importCsv('french,english,difficulty,tags\nOui.,Yes.,2,"oui; réponse"\nNon.,,1,\nOui.,Yes again.,1,\n', c);
    expect(r.summary).toBe('Added 1 phrase.');
    expect(r.skipped).toHaveLength(2);
    const [p] = await db.phrases.where('collectionId').equals(c).toArray();
    expect(p?.difficulty).toBe(2);
    expect(p?.vocabularyTags).toEqual(['oui', 'réponse']);
  });

  it('rejects CSV without the required columns', async () => {
    await expect(importCsv('a,b\n1,2\n', 'x')).rejects.toThrow(/french/);
  });

  it('imports JSON lists and rejects bad JSON', async () => {
    const c = await createCollection('Mine');
    await importJson(JSON.stringify({ phrases: [{ french: 'Merci.', english: 'Thanks.' }] }), c);
    expect(await db.phrases.where('collectionId').equals(c).count()).toBe(1);
    await expect(importJson('{nope', c)).rejects.toThrow(/valid JSON/);
  });

  it('exports CSV that reimports', async () => {
    const c = await createCollection('Ma Liste');
    await importCsv('french,english\n"Oui, merci.",Yes thanks.\n', c);
    const { blob, filename } = await exportCollectionCsv(c);
    expect(filename).toBe('ecoute-ma-liste.csv');
    const d = await createCollection('Copy');
    await importCsv(await blob.text(), d);
    expect((await db.phrases.where('collectionId').equals(d).first())?.french).toBe('Oui, merci.');
  });

  it('attaches audio only on an exact phrase ID, never approximately', async () => {
    await mergeLibrary(library, [], {});
    const zip = zipSync({ 'greeting-001.mp3': new Uint8Array([1, 2]), 'greeting-01.mp3': new Uint8Array([3]), 'x/renamed.mp3': new Uint8Array([4]), 'manifest.json': strToU8(JSON.stringify([{ id: 'greeting-002', file: 'x/renamed.mp3' }])) });
    const r = await importZip(zip);
    expect(r.summary).toBe('Attached 2 of 3 recordings.');
    expect(r.skipped[0]).toMatch(/greeting-01/);
    expect((await db.phrases.get('greeting-001'))?.audioId).toBe('greeting-001');
    expect((await db.phrases.get('greeting-002'))?.audioId).toBe('greeting-002');
  });

  it('restores a backup exactly, replacing newer changes', async () => {
    await mergeLibrary(library, manifest, files());
    await ratePhrase('greeting-001', 'immediate', 'review', 1);
    await toggleBookmark('greeting-002');
    await updateSettings({ autoAdvance: true });
    const backup = new Uint8Array(await (await createBackup()).arrayBuffer());

    await clearAllData();
    await createCollection('Later');
    const r = await importZip(backup);
    expect(r.summary).toMatch(/Restored backup: 2 phrases, 3 recordings/);
    expect((await db.collections.toArray()).map((c) => c.id)).toEqual(['greetings']);
    expect((await db.phrases.get('greeting-001'))?.status).toBe('familiar');
    expect(await db.reviews.count()).toBe(1);
    expect(await db.bookmarks.count()).toBe(1);
    expect((await getSettings()).autoAdvance).toBe(true);
    const audio = await db.audio.get('greeting-001');
    expect(audio?.blob.size).toBe(4);
  });

  it('leaves data untouched when a backup is damaged', async () => {
    await mergeLibrary(library, manifest, files());
    const backup = new Uint8Array(await (await createBackup()).arrayBuffer());
    const { unzipSync } = await import('fflate');
    const parts = unzipSync(backup);
    delete parts['audio/greeting-001.mp3'];
    await db.collections.add({ id: 'keep', title: 'Keep', order: 9, builtIn: false, createdAt: 0, updatedAt: 0 });
    await expect(importZip(zipSync(parts))).rejects.toThrow(/damaged/);
    expect(await db.collections.get('keep')).toBeDefined();
  });
});
