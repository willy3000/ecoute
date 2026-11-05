// Builds the shipped audio manifest and starter-library ZIP from audio/, joining
// strictly by job ID. Run after generation and verification: npm run content:package
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const jobs = read('content-source/audio-jobs.json');
const library = read('public/content/library.json');
const verificationPath = 'scripts/audio-validation/audio-verification.json';
const verified = existsSync(join(root, verificationPath));
const verification = new Map(verified ? read(verificationPath).map((r) => [r.id, r]) : []);
const generationLog = read('scripts/audio-validation/audio-generation-log.json');
if (!verified) console.warn('No verification results yet. Recordings will be marked generated-not-yet-verified.');
const reviewPath = join(root, 'scripts/audio-validation/audio-manual-review.json');
const manual = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, 'utf8')) : {};

const PROVIDER = 'Piper (local neural TTS, rhasspy/piper-voices)';
const VOICE = 'fr_FR-siwis-medium';
const missing = [];
const counts = {};

const entries = jobs.map((job) => {
  const v = verification.get(job.id);
  const path = join(root, job.file);
  if (!existsSync(path) || (verified && !v?.technical)) missing.push(job.id);
  // Status never claims more than the evidence for this one file.
  let status;
  if (!verified) status = 'generated-not-yet-verified';
  else if (!v?.technical) status = 'failed-technical-check';
  else if (v.exact) status = 'technical-ok-transcript-exact';
  else if (manual[job.id]) status = `technical-ok-${manual[job.id]}`;
  else status = 'technical-ok-needs-human-listening';
  counts[status] = (counts[status] ?? 0) + 1;
  return {
    id: job.id,
    file: job.file,
    kind: job.kind,
    french: job.french,
    english: job.english,
    provider: PROVIDER,
    voice: VOICE,
    language: 'fr-FR',
    durationSeconds: v?.seconds ?? generationLog[job.id]?.seconds ?? 0,
    status,
    heard: v?.heard ?? null,
    similarity: v?.similarity ?? null,
  };
});

if (missing.length) {
  console.error(`Refusing to package. ${missing.length} recordings failed: ${missing.slice(0, 20).join(', ')}`);
  process.exit(1);
}

const manifest = { generatedAt: new Date().toISOString(), contentVersion: library.contentVersion, provider: PROVIDER, voice: VOICE, summary: counts, entries };
const manifestJson = JSON.stringify(manifest);
writeFileSync(join(root, 'public/content/audio-manifest.json'), manifestJson);

// MP3 is already compressed, so entries are stored rather than deflated.
const files = {
  'library.json': strToU8(JSON.stringify(library)),
  'audio-manifest.json': strToU8(manifestJson),
};
for (const e of entries) files[e.file] = new Uint8Array(readFileSync(join(root, e.file)));
const zip = zipSync(files, { level: 0 });
const out = join(root, 'public/content/ecoute-audio-v1.zip');
writeFileSync(out, zip);
console.log(`${entries.length} recordings, ${(statSync(out).size / 1048576).toFixed(1)} MB`);
console.log(counts);
