import { useSyncExternalStore } from 'react';
import { engine, type EngineState } from '../services/audio/engine';

export const useEngine = (): EngineState => useSyncExternalStore(engine.subscribe, engine.getState);
