import { useSyncExternalStore } from 'react';

// Hash routing keeps every route working from a static host, offline, and under
// any subpath, with no server rewrites.

const read = () => window.location.hash.replace(/^#\/?/, '');
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/** Path segments of the current route: "#/library/phrases" gives library, phrases. */
export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, read);
  return hash.split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(path: string): void {
  window.location.hash = `/${path}`;
}

export const href = (path: string) => `#/${path}`;
