import { useEffect, useRef } from 'react';
import { engine } from '../services/audio/engine';
import { logListening } from '../services/learning/review';
import type { SessionMode } from '../types';

/** Flushes heard time to the sessions table each minute, on hide, and on leaving. */
export function useListeningLog(mode: SessionMode, collectionId?: string): void {
  const context = useRef({ mode, collectionId });
  context.current = { mode, collectionId };

  useEffect(() => {
    const flush = () => {
      const { seconds, plays } = engine.takeListened();
      void logListening(context.current.mode, seconds, plays, context.current.collectionId);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const timer = setInterval(flush, 60_000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);
}
