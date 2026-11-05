import { useEffect, useRef } from 'react';

export type ShortcutMap = Record<string, () => void>;

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Global keyboard shortcuts, ignored while typing or while a dialog is open. */
export function useShortcuts(map: ShortcutMap): void {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const action = ref.current[key];
      if (action) {
        // Stops Space from also activating a focused button.
        e.preventDefault();
        if (!e.repeat) action();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && e.target instanceof HTMLButtonElement && ref.current[' ']) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
