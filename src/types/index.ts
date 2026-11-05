// Every persisted entity in the local database.

export type LearningStatus = 'new' | 'learning' | 'difficult' | 'familiar' | 'mastered';
export type Difficulty = 1 | 2 | 3;
export type Register = 'standard' | 'informal';
export type VocabStatus = 'unknown' | 'known';

/** How well a phrase was understood, from worst to best. */
export type Rating = 'unknown' | 'difficult' | 'repetition' | 'immediate';

export type PracticeMode = 'immersion' | 'comprehension' | 'shadowing' | 'dictation';
export type SessionMode = 'listen' | 'review' | PracticeMode;

export interface Collection {
  id: string;
  title: string;
  titleFr?: string;
  description?: string;
  order: number;
  /** True for collections that shipped with the app. */
  builtIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Phrase {
  id: string;
  collectionId: string;
  order: number;
  french: string;
  english: string;
  spokenAlternative?: string;
  difficulty: Difficulty;
  category: string;
  vocabularyTags: string[];
  pronunciationNotes?: string;
  register: Register;
  /** For an informal phrase: the standard form it relates to. */
  linkedPhraseId?: string;
  /** For a standard phrase: its informal spoken counterparts. */
  informalPhraseIds?: string[];
  /** Key into the audio table, or undefined when no recording exists. */
  audioId?: string;

  // Learning state
  status: LearningStatus;
  /** Epoch ms when the phrase is next due. 0 means never reviewed. */
  dueAt: number;
  intervalDays: number;
  /** Consecutive reviews rated "immediate". */
  streak: number;
  lapses: number;
  reviewCount: number;
  /** Total times the recording finished playing. */
  listenCount: number;
  firstRating?: Rating;
  lastReviewedAt?: number;

  builtIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AudioRecording {
  id: string;
  blob: Blob;
  mimeType: string;
  durationSeconds?: number;
  provider?: string;
  voice?: string;
  createdAt: number;
}

export interface VocabularyEntry {
  id: string;
  french: string;
  english: string;
  partOfSpeech: string;
  gender?: string;
  pronunciation?: string;
  exampleFrench?: string;
  exampleEnglish?: string;
  category: string;
  /** Conjugated or inflected forms used to find phrases containing the word. */
  forms: string[];
  audioId?: string;
  exampleAudioId?: string;
  status: VocabStatus;
  builtIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewRecord {
  id?: number;
  phraseId: string;
  rating: Rating;
  mode: SessionMode;
  /** How many times it was played before this rating. */
  plays: number;
  reviewedAt: number;
  /** YYYY-MM-DD in local time, for daily aggregation. */
  day: string;
}

export interface ListeningSession {
  id?: number;
  mode: SessionMode;
  collectionId?: string;
  startedAt: number;
  /** Seconds of audio actually heard. */
  seconds: number;
  plays: number;
  day: string;
}

export interface Bookmark {
  phraseId: string;
  createdAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export type PlaybackSpeed = 0.75 | 0.85 | 1 | 1.15 | 1.25;

export interface AppSettings {
  defaultSpeed: PlaybackSpeed;
  showTranslationByDefault: boolean;
  showTranscriptByDefault: boolean;
  defaultPracticeMode: PracticeMode;
  autoAdvance: boolean;
  repeatCurrent: boolean;
  /** Seconds of quiet between phrases in continuous mode. */
  autoAdvanceGapSeconds: number;
  preferredVoice: string;
  lastCollectionId?: string;
  /** Per-collection last position, so each collection resumes where it stopped. */
  lastPhraseByCollection: Record<string, string>;
  seededContentVersion: number;
}

// ---------- Shipped content package ----------

export interface LibraryPhrase {
  id: string;
  collectionId: string;
  order: number;
  french: string;
  english: string;
  spokenAlternative?: string;
  difficulty: Difficulty;
  category: string;
  vocabularyTags: string[];
  pronunciationNotes?: string;
  register: Register;
  linkedPhraseId?: string;
  informalPhraseIds?: string[];
  audioFile: string;
}

export interface LibraryVocabulary {
  id: string;
  french: string;
  english: string;
  partOfSpeech: string;
  gender?: string;
  pronunciation: string;
  exampleFrench: string;
  exampleEnglish: string;
  category: string;
  forms: string[];
  audioFile: string;
  exampleAudioFile: string;
}

export interface LibraryCollection {
  id: string;
  title: string;
  titleFr: string;
  description: string;
  order: number;
}

export interface LibraryPackage {
  contentVersion: number;
  collections: LibraryCollection[];
  phrases: LibraryPhrase[];
  vocabulary: LibraryVocabulary[];
}

export interface ManifestEntry {
  id: string;
  file: string;
  kind: 'phrase' | 'word' | 'example';
  french: string;
  english: string;
  provider: string;
  voice: string;
  language: string;
  durationSeconds: number;
  status: string;
}
