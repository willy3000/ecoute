// Audits the shipped package: counts, IDs, translations, audio, and exact mapping.
// Run with: npm run content:check. Exits non-zero on any failure.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lib = JSON.parse(readFileSync(join(root, 'public/content/library.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'public/content/audio-manifest.json'), 'utf8'));
const zip = unzipSync(new Uint8Array(readFileSync(join(root, 'public/content/ecoute-audio-v1.zip'))));
const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

const collectionIds = new Set(lib.collections.map((c) => c.id));
const ids = [...lib.phrases.map((p) => p.id), ...lib.vocabulary.map((v) => v.id)];
check(new Set(ids).size === ids.length, 'duplicate IDs');
check(lib.phrases.length >= 400, `only ${lib.phrases.length} phrases`);
check(lib.vocabulary.length >= 200, `only ${lib.vocabulary.length} vocabulary entries`);

const byFile = new Map(manifest.entries.map((e) => [e.file, e]));
const isMp3 = (b) => b && b.length > 1000 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
const audit = (id, file, french) => {
  const e = byFile.get(file);
  check(e && e.id === id, `${id}: manifest does not map ${file} to this ID`);
  check(e?.french === french, `${id}: manifest French differs from the library`);
  check(e?.durationSeconds > 0.3, `${id}: bad duration ${e?.durationSeconds}`);
  check(isMp3(zip[file]), `${id}: ${file} missing from the ZIP or not MP3`);
  check(existsSync(join(root, file)), `${id}: master ${file} missing`);
};

for (const p of lib.phrases) {
  check(p.english?.trim(), `${p.id}: no translation`);
  check(p.french?.trim(), `${p.id}: no French`);
  check(collectionIds.has(p.collectionId), `${p.id}: unknown collection ${p.collectionId}`);
  check([1, 2, 3].includes(p.difficulty), `${p.id}: bad difficulty`);
  audit(p.id, p.audioFile, p.french);
}
for (const v of lib.vocabulary) {
  check(v.english?.trim() && v.partOfSpeech && v.pronunciation && v.exampleFrench, `${v.id}: incomplete`);
  audit(v.id, v.audioFile, v.french);
  audit(`${v.id}-ex`, v.exampleAudioFile, v.exampleFrench);
}
for (const c of lib.collections) check(lib.phrases.some((p) => p.collectionId === c.id), `collection ${c.id} is empty`);
check(manifest.entries.length === lib.phrases.length + lib.vocabulary.length * 2, 'manifest count mismatch');
const zipAudio = Object.keys(zip).filter((n) => n.endsWith('.mp3')).length;
check(zipAudio === manifest.entries.length, `ZIP has ${zipAudio} recordings, manifest has ${manifest.entries.length}`);

console.log(`Collections: ${lib.collections.length}`);
for (const c of lib.collections) console.log(`  ${c.title}: ${lib.phrases.filter((p) => p.collectionId === c.id).length}`);
console.log(`Phrases: ${lib.phrases.length}. Vocabulary: ${lib.vocabulary.length}. Recordings: ${manifest.entries.length}.`);
console.log('Audio status:', manifest.summary);
console.log(`Total phrase audio: ${(manifest.entries.filter((e) => e.kind === 'phrase').reduce((s, e) => s + e.durationSeconds, 0) / 60).toFixed(1)} min`);
if (problems.length) {
  for (const p of problems.slice(0, 40)) console.error(`FAIL ${p}`);
  console.error(`${problems.length} problem(s)`);
  process.exit(1);
}
console.log('All package checks passed.');
