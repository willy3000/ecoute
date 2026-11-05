// Parses content-source/ into public/content/library.json and fails loudly on
// anything that would ship a broken library. Run with: npm run content:build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(root, 'content-source');
const errors = [];
const warnings = [];

const NBSP = ' ';
/** Typographic display form: curly apostrophes, no-break space before ? ! : ; */
const typeset = (s) => s.replace(/'/g, '’').replace(/ ([?!:;])/g, `${NBSP}$1`);
/** Comparison key: case, accents and punctuation removed. */
const key = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/** Lowercase word list keeping accents, with elided articles split off. */
const words = (s) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "' ")
    .replace(/-/g, ' ')
    .split(/[^\p{L}']+/u)
    .map((w) => w.replace(/'$/, ''))
    .filter(Boolean);

const rows = (path) =>
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('# '));

// ---------- TTS respellings ----------
const overrides = new Map(
  rows(join(src, 'tts-overrides.txt')).map((l) => {
    const [k, v] = l.split(' | ');
    return [k.trim(), v.trim()];
  }),
);
const usedOverrides = new Set();
/** "il y a" is two syllables in the voice's front end, but one glide in real speech. */
const glideYa = (s) => s.replace(/\b([Ii]l|qu'il) y a\b/g, '$1 ya').replace(/n'y a\b/g, "n'ya").replace(/^Y a\b/, 'Ya');
const ttsFor = (key, text) => {
  const hit = overrides.get(key);
  if (hit) usedOverrides.add(key);
  return glideYa(hit ?? text);
};

// ---------- Vocabulary ----------
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection', 'number', 'question word']);
const vocabulary = [];
let vocabCategory = '';
for (const line of rows(join(src, 'vocabulary.txt'))) {
  if (line.startsWith('## ')) {
    vocabCategory = line.slice(3).trim();
    continue;
  }
  const [french, english, partOfSpeech, gender, ipa, exampleFrench, exampleEnglish, forms] = line.split('|').map((c) => c?.trim() ?? '');
  const n = String(vocabulary.length + 1).padStart(3, '0');
  const id = `vocab-${n}`;
  if (!french || !english || !ipa || !exampleFrench || !exampleEnglish) errors.push(`vocabulary: incomplete row "${line}"`);
  if (!POS.has(partOfSpeech)) errors.push(`vocabulary ${french}: unknown part of speech "${partOfSpeech}"`);
  if (partOfSpeech === 'noun' && !gender) errors.push(`vocabulary ${french}: noun without gender`);
  if (!/^\/.+\/$/.test(ipa)) errors.push(`vocabulary ${french}: IPA must be between slashes`);
  vocabulary.push({
    id,
    french,
    english,
    partOfSpeech,
    gender: gender || undefined,
    pronunciation: ipa,
    exampleFrench: typeset(exampleFrench),
    exampleEnglish,
    category: vocabCategory,
    forms: (forms || '').split(',').map((f) => f.trim()).filter(Boolean),
    audioFile: `audio/vocabulary/${id}.mp3`,
    exampleAudioFile: `audio/vocabulary/${id}-ex.mp3`,
    exampleSource: exampleFrench,
    ttsWord: ttsFor(`word:${french}`, french),
    ttsExample: ttsFor(`ex:${exampleFrench}`, exampleFrench),
  });
}
const seenVocab = new Map();
for (const v of vocabulary) {
  const k = `${key(v.french)}|${v.partOfSpeech}`;
  if (seenVocab.has(k)) errors.push(`vocabulary: duplicate "${v.french}"`);
  seenVocab.set(k, v.id);
  if (!/[.?!]$/.test(v.exampleSource)) errors.push(`vocabulary ${v.french}: example lacks final punctuation`);
  const all = [v.french, ...v.forms].map((f) => words(f).join(' '));
  const ex = ` ${words(v.exampleSource).join(' ')} `;
  if (!all.some((f) => ex.includes(` ${f} `))) warnings.push(`vocabulary ${v.french}: example "${v.exampleSource}" does not contain the word or a listed form`);
}

// Index of single- and multi-word forms used to tag phrases with vocabulary.
const formIndex = new Map();
for (const v of vocabulary) {
  for (const f of [v.french, ...v.forms]) {
    const k = words(f).join(' ');
    if (!formIndex.has(k)) formIndex.set(k, []);
    formIndex.get(k).push(v.french);
  }
}
const tagsFor = (french) => {
  const ws = words(french);
  const found = new Set();
  for (let i = 0; i < ws.length; i++) {
    for (let len = 3; len >= 1; len--) {
      const hit = formIndex.get(ws.slice(i, i + len).join(' '));
      if (hit) for (const h of hit) found.add(h);
    }
  }
  return [...found];
};

// ---------- Phrases ----------
const collections = JSON.parse(readFileSync(join(src, 'collections.json'), 'utf8'));
const phrases = [];
collections.forEach((c, order) => {
  let category = '';
  let count = 0;
  const seenNums = new Set();
  for (const line of rows(join(src, 'phrases', c.file))) {
    if (line.startsWith('## ')) {
      category = line.slice(3).trim();
      continue;
    }
    const [num, french, english, diff, note, alt, register, link] = line.split('|').map((x) => x?.trim() ?? '');
    const n = Number(num);
    const id = `${c.prefix}-${String(n).padStart(3, '0')}`;
    if (!Number.isInteger(n) || seenNums.has(n)) errors.push(`${c.file}: bad or duplicate number "${num}"`);
    seenNums.add(n);
    if (!french || !english) errors.push(`${id}: missing French or English`);
    if (!['1', '2', '3'].includes(diff)) errors.push(`${id}: difficulty must be 1-3, got "${diff}"`);
    if (register && register !== 'informal') errors.push(`${id}: unknown register "${register}"`);
    if (!/[.?!]$/.test(french)) errors.push(`${id}: French lacks final punctuation`);
    if (/[?!]$/.test(french) && !/ [?!]$/.test(french)) errors.push(`${id}: French needs a space before final ? or !`);
    if (!/[.?!)]$/.test(english)) errors.push(`${id}: English lacks final punctuation`);
    count++;
    phrases.push({
      id,
      collectionId: c.id,
      order: count,
      french: typeset(french),
      english,
      spokenAlternative: alt ? typeset(alt) : undefined,
      difficulty: Number(diff),
      category,
      vocabularyTags: tagsFor(french),
      pronunciationNotes: note || undefined,
      register: register === 'informal' ? 'informal' : 'standard',
      linkedPhraseId: link || undefined,
      audioFile: `audio/${c.id}/${id}.mp3`,
      sourceFrench: french,
      ttsText: ttsFor(id, french),
    });
  }
  console.log(`${c.id.padEnd(10)} ${String(count).padStart(3)} phrases`);
});

// ---------- Cross-checks ----------
const byId = new Map();
const byKey = new Map();
for (const p of phrases) {
  if (byId.has(p.id)) errors.push(`duplicate id ${p.id}`);
  byId.set(p.id, p);
  const k = key(p.french);
  if (byKey.has(k)) errors.push(`duplicate phrase "${p.french}" in ${byKey.get(k)} and ${p.id}`);
  byKey.set(k, p.id);
}
for (const p of phrases) {
  if (!p.linkedPhraseId) continue;
  const target = byId.get(p.linkedPhraseId);
  if (!target) errors.push(`${p.id}: linked phrase ${p.linkedPhraseId} does not exist`);
  else if (target.register === 'informal') errors.push(`${p.id}: links to an informal phrase, ${target.id}`);
}
// Any informal form that drops "ne" must explain itself in its note.
for (const p of phrases.filter((x) => x.register === 'informal')) {
  if (!p.pronunciationNotes) errors.push(`${p.id}: informal phrase has no explanatory note`);
}
// Link each standard phrase back to its informal counterpart.
for (const p of phrases) {
  if (p.register === 'informal' && p.linkedPhraseId) {
    const std = byId.get(p.linkedPhraseId);
    if (std) (std.informalPhraseIds ??= []).push(p.id);
  }
}
const untagged = phrases.filter((p) => p.vocabularyTags.length === 0);

if (phrases.length < 400) errors.push(`only ${phrases.length} phrases, need at least 400`);
if (vocabulary.length < 200) errors.push(`only ${vocabulary.length} vocabulary entries, need at least 200`);

for (const k of overrides.keys()) if (!usedOverrides.has(k)) errors.push(`tts-overrides: "${k}" matches nothing`);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\n${errors.length} error(s). Library not written.`);
  process.exit(1);
}

mkdirSync(join(root, 'public', 'content'), { recursive: true });
const contentVersion = 1;
const collectionsOut = collections.map(({ id, title, titleFr, description }, order) => ({ id, title, titleFr, description, order }));
// What the app ships, without the pipeline-only TTS fields.
writeFileSync(
  join(root, 'public', 'content', 'library.json'),
  JSON.stringify({
    contentVersion,
    collections: collectionsOut,
    phrases: phrases.map(({ ttsText, sourceFrench, ...p }) => p),
    vocabulary: vocabulary.map(({ ttsWord, ttsExample, exampleSource, ...v }) => v),
  }),
);
// Audio job list consumed by scripts/audio-validation/generate_audio.py.
const jobs = [
  ...phrases.map((p) => ({ id: p.id, file: p.audioFile, kind: 'phrase', french: p.french, source: p.sourceFrench, english: p.english, tts: p.ttsText })),
  ...vocabulary.flatMap((v) => [
    { id: v.id, file: v.audioFile, kind: 'word', french: v.french, source: v.french, english: v.english, tts: v.ttsWord },
    { id: `${v.id}-ex`, file: v.exampleAudioFile, kind: 'example', french: v.exampleFrench, source: v.exampleSource, english: v.exampleEnglish, tts: v.ttsExample },
  ]),
];
writeFileSync(join(root, 'content-source', 'audio-jobs.json'), JSON.stringify(jobs, null, 1));
console.log(`\n${collections.length} collections, ${phrases.length} phrases, ${vocabulary.length} vocabulary entries`);
console.log(`${phrases.filter((p) => p.register === 'informal').length} informal, ${phrases.filter((p) => p.linkedPhraseId).length} linked, ${untagged.length} with no vocabulary tag, ${warnings.length} warning(s)`);
