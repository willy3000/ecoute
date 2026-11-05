import { Button } from '../components/ui';
import type { SeedProgress } from '../services/import/seed';

const STAGE_TEXT: Record<SeedProgress['stage'], string> = {
  library: 'Preparing the library',
  audio: 'Downloading recordings',
  storing: 'Saving recordings to this device',
  done: 'Ready',
};

export function SetupScreen({ progress, error, onRetry }: { progress?: SeedProgress; error?: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="french text-5xl tracking-tight">Écoute</h1>
        <p className="mt-3 text-fg-muted">Listen first. Understand naturally. Repeat until fluent.</p>
        {error ? (
          <div className="mt-10" role="alert">
            <p className="font-medium">The library could not be installed.</p>
            <p className="mt-1 text-sm text-fg-muted">First-time setup needs a connection once. After that, Écoute works offline.</p>
            <p className="mt-2 text-xs break-words text-fg-muted">{error}</p>
            <Button className="mt-5" variant="primary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-10" aria-live="polite">
            <p className="text-sm text-fg-soft">{progress ? STAGE_TEXT[progress.stage] : 'Opening'}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-teal transition-[width]" style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
