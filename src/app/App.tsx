import { useEffect, useState } from 'react';
import { LibraryPage } from '../features/library/LibraryPage';
import { ListenPage } from '../features/player/ListenPage';
import { PracticePage } from '../features/practice/PracticePage';
import { ProgressPage } from '../features/progress/ProgressPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { installStarterLibrary, needsSeeding, type SeedProgress } from '../services/import/seed';
import { useRoute } from './router';
import { SetupScreen } from './SetupScreen';
import { Shell } from './Shell';

type Boot = { state: 'checking' } | { state: 'installing'; progress: SeedProgress } | { state: 'failed'; message: string } | { state: 'ready' };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'checking' });
  const route = useRoute();

  const install = async () => {
    try {
      if (!(await needsSeeding())) {
        setBoot({ state: 'ready' });
        return;
      }
      setBoot({ state: 'installing', progress: { stage: 'library', fraction: 0 } });
      // Ask the browser not to evict the library under storage pressure.
      void navigator.storage?.persist?.();
      await installStarterLibrary((progress) => setBoot({ state: 'installing', progress }));
      setBoot({ state: 'ready' });
    } catch (error) {
      setBoot({ state: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    void install();
  }, []);

  if (boot.state !== 'ready') {
    return <SetupScreen progress={boot.state === 'installing' ? boot.progress : undefined} error={boot.state === 'failed' ? boot.message : undefined} onRetry={() => void install()} />;
  }

  const section = route[0] ?? 'listen';
  return (
    <Shell section={section}>
      {section === 'library' ? (
        <LibraryPage route={route.slice(1)} />
      ) : section === 'practice' ? (
        <PracticePage route={route.slice(1)} />
      ) : section === 'progress' ? (
        <ProgressPage />
      ) : section === 'settings' ? (
        <SettingsPage />
      ) : (
        <ListenPage />
      )}
    </Shell>
  );
}
