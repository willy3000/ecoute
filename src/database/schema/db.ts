import Dexie, { type Table } from 'dexie';
import type {
  AudioRecording,
  Bookmark,
  Collection,
  ListeningSession,
  Phrase,
  ReviewRecord,
  SettingRow,
  VocabularyEntry,
} from '../../types';
import { applyMigrations } from '../migrations';

export class EcouteDatabase extends Dexie {
  collections!: Table<Collection, string>;
  phrases!: Table<Phrase, string>;
  audio!: Table<AudioRecording, string>;
  vocabulary!: Table<VocabularyEntry, string>;
  reviews!: Table<ReviewRecord, number>;
  sessions!: Table<ListeningSession, number>;
  bookmarks!: Table<Bookmark, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'ecoute') {
    super(name);
    applyMigrations(this);
  }
}

export const db = new EcouteDatabase();
