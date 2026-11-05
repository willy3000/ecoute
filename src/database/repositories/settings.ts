import type { AppSettings } from '../../types';
import { db } from '../schema/db';

export const DEFAULT_SETTINGS: AppSettings = {
  defaultSpeed: 1,
  showTranslationByDefault: false,
  showTranscriptByDefault: false,
  defaultPracticeMode: 'comprehension',
  autoAdvance: false,
  repeatCurrent: false,
  autoAdvanceGapSeconds: 1.5,
  preferredVoice: 'Piper fr_FR-siwis-medium',
  lastPhraseByCollection: {},
  seededContentVersion: 0,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
}
