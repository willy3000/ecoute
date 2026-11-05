import type { Phrase, VocabStatus, VocabularyEntry } from '../../types';
import { frenchWords } from '../../utils/text';
import { db } from '../schema/db';

export interface VocabularyInput {
  french: string;
  english: string;
  partOfSpeech: string;
  gender?: string;
  pronunciation?: string;
  exampleFrench?: string;
  exampleEnglish?: string;
  category: string;
  forms: string[];
}

export async function createWord(input: VocabularyInput): Promise<string> {
  const id = `user-${crypto.randomUUID()}`;
  const now = Date.now();
  await db.vocabulary.add({ ...input, id, status: 'unknown', builtIn: false, createdAt: now, updatedAt: now });
  return id;
}

export async function updateWord(id: string, input: VocabularyInput): Promise<void> {
  await db.vocabulary.update(id, { ...input, updatedAt: Date.now() });
}

export async function setWordStatus(id: string, status: VocabStatus): Promise<void> {
  await db.vocabulary.update(id, { status, updatedAt: Date.now() });
}

export async function deleteWord(id: string): Promise<void> {
  await db.transaction('rw', db.vocabulary, db.audio, async () => {
    const word = await db.vocabulary.get(id);
    const audioIds = [word?.audioId, word?.exampleAudioId].filter((x): x is string => Boolean(x));
    await db.audio.bulkDelete(audioIds);
    await db.vocabulary.delete(id);
  });
}

/**
 * Whether a phrase contains a word or any of its listed forms. This matches
 * real word boundaries, so "a" does not match inside "ta".
 */
export function phraseContainsWord(phrase: Pick<Phrase, 'french'>, word: Pick<VocabularyEntry, 'french' | 'forms'>): boolean {
  const haystack = ` ${frenchWords(phrase.french).join(' ')} `;
  return [word.french, ...word.forms].some((form) => {
    const needle = frenchWords(form).join(' ');
    return needle.length > 0 && haystack.includes(` ${needle} `);
  });
}

export async function phrasesContainingWord(word: Pick<VocabularyEntry, 'french' | 'forms'>): Promise<Phrase[]> {
  return db.phrases.filter((p) => phraseContainsWord(p, word)).toArray();
}
