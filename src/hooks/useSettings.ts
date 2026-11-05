import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../database/repositories/settings';
import type { AppSettings } from '../types';

/** Live settings, or undefined during the first read. */
export const useSettings = (): AppSettings | undefined => useLiveQuery(getSettings, []);
