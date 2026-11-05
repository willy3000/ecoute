import { useLiveQuery } from 'dexie-react-hooks';
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, ConfirmDialog, Field, Page, Segmented } from '../../components/ui';
import { updateSettings } from '../../database/repositories/settings';
import { db } from '../../database/schema/db';
import { useSettings } from '../../hooks/useSettings';
import { backupFilename, clearAllData, createBackup, downloadBlob, resetProgress } from '../../services/export/backup';
import { importZip } from '../../services/import/importers';
import { installStarterLibrary } from '../../services/import/seed';
import { engine } from '../../services/audio/engine';
import type { PlaybackSpeed, PracticeMode } from '../../types';
import { formatBytes } from '../../utils/text';

type Danger = 'progress' | 'all' | 'restore';

export function SettingsPage() {
  const settings = useSettings();
  const counts = useLiveQuery(async () => ({ phrases: await db.phrases.count(), audio: await db.audio.count(), words: await db.vocabulary.count() }), []);
  const voices = useLiveQuery(async () => (await db.audio.limit(1).toArray())[0], []);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean }>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [danger, setDanger] = useState<Danger>();
  const [pendingFile, setPendingFile] = useState<File>();

  useEffect(() => {
    void (async () => {
      const estimate = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      if (estimate) setStorage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted });
    })();
  }, [counts]);

  if (!settings) return null;

  const act = async (work: () => Promise<string>) => {
    setBusy(true);
    setMessage(undefined);
    try {
      setMessage(await work());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const backup = () =>
    act(async () => {
      downloadBlob(await createBackup(), backupFilename());
      return 'Backup downloaded. Keep the file somewhere safe.';
    });

  const restoreStarter = () =>
    act(async () => {
      await installStarterLibrary(() => {});
      return 'Starter library restored. Your progress and your own phrases were kept.';
    });

  const runRestore = () =>
    act(async () => {
      if (!pendingFile) return 'Choose a file first.';
      const report = await importZip(new Uint8Array(await pendingFile.arrayBuffer()));
      return report.summary;
    });

  const confirm = async () => {
    const kind = danger;
    setDanger(undefined);
    if (kind === 'restore') await runRestore();
    if (kind === 'progress') {
      await act(async () => {
        await resetProgress();
        return 'Progress cleared. The library and recordings were kept.';
      });
    }
    if (kind === 'all') {
      await clearAllData();
      window.location.reload();
    }
  };

  return (
    <Page title="Settings">
      <div className="space-y-4">
        <Group title="Playback">
          <Row label="Default speed">
            <Segmented<PlaybackSpeed>
              label="Default speed"
              value={settings.defaultSpeed}
              onChange={(v) => {
                engine.setSpeed(v);
                void updateSettings({ defaultSpeed: v });
              }}
              options={[0.75, 0.85, 1, 1.15, 1.25].map((s) => ({ value: s as PlaybackSpeed, label: `${s}×` }))}
            />
          </Row>
          <Toggle label="Automatic next phrase" checked={settings.autoAdvance} onChange={(v) => void updateSettings({ autoAdvance: v })} />
          <Toggle label="Repeat current phrase" checked={settings.repeatCurrent} onChange={(v) => void updateSettings({ repeatCurrent: v })} />
          <Row label="Pause between phrases">
            <label className="flex items-center gap-2 text-sm text-fg-soft">
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                aria-label="Pause between phrases in seconds"
                value={settings.autoAdvanceGapSeconds}
                onChange={(e) => void updateSettings({ autoAdvanceGapSeconds: Number(e.target.value) })}
              />
              <span className="w-10 tabular-nums">{settings.autoAdvanceGapSeconds} s</span>
            </label>
          </Row>
        </Group>

        <Group title="Listening view">
          <Toggle label="Show French transcript by default" checked={settings.showTranscriptByDefault} onChange={(v) => void updateSettings({ showTranscriptByDefault: v })} />
          <Toggle label="Show English translation by default" checked={settings.showTranslationByDefault} onChange={(v) => void updateSettings({ showTranslationByDefault: v })} />
          <Row label="Default practice mode">
            <select aria-label="Default practice mode" className="field w-auto!" value={settings.defaultPracticeMode} onChange={(e) => void updateSettings({ defaultPracticeMode: e.target.value as PracticeMode })}>
              <option value="immersion">Immersion</option>
              <option value="comprehension">Comprehension</option>
              <option value="shadowing">Shadowing</option>
              <option value="dictation">Dictation</option>
            </select>
          </Row>
          <div className="py-2">
            <Field label="Preferred French voice" hint={`Label for your own records and future recordings. Built-in recordings use ${voices?.voice ?? 'one fixed voice'} from ${voices?.provider ?? 'the starter library'}.`}>
              <input className="field" value={settings.preferredVoice} onChange={(e) => void updateSettings({ preferredVoice: e.target.value })} />
            </Field>
          </div>
        </Group>

        <Group title="Your data">
          <p className="py-2 text-sm text-fg-soft" data-testid="storage-info">
            {counts ? `${counts.phrases} phrases, ${counts.audio} recordings, ${counts.words} words. ` : ''}
            {storage ? `Using ${formatBytes(storage.usage)} of ${formatBytes(storage.quota)} available. ` : ''}
            {storage ? (storage.persisted ? 'The browser has agreed to keep this data.' : 'Storage is not marked permanent, so keep a backup.') : ''}
          </p>
          <div className="flex flex-wrap gap-2 py-2">
            <Button disabled={busy} onClick={() => void backup()}>
              <Download size={15} /> Download full backup
            </Button>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink-800 px-4 py-2 text-sm font-medium hover:bg-ink-700">
              <Upload size={15} /> Restore from file
              <input
                type="file"
                accept=".zip"
                className="sr-only"
                data-testid="restore-input"
                onChange={(e) => {
                  setPendingFile(e.target.files?.[0]);
                  e.target.value = '';
                  setDanger('restore');
                }}
              />
            </label>
            <Button disabled={busy} onClick={() => void restoreStarter()}>
              <RotateCcw size={15} /> Restore starter library
            </Button>
          </div>
          {message ? (
            <p className="py-1 text-sm text-teal-soft" role="status" data-testid="settings-message">
              {message}
            </p>
          ) : null}
          <p className="py-1 text-xs text-fg-muted">Restoring the starter library needs a connection, or you can restore from the ecoute-audio ZIP while offline.</p>
          <div className="flex flex-wrap gap-2 border-t border-ink-800 py-3">
            <Button variant="danger" onClick={() => setDanger('progress')}>
              Reset progress
            </Button>
            <Button variant="danger" onClick={() => setDanger('all')}>
              <Trash2 size={15} /> Clear all local data
            </Button>
          </div>
        </Group>
      </div>

      {danger === 'progress' ? (
        <ConfirmDialog title="Reset all progress?" body="Ratings, review schedules, listening history and bookmarks will be erased. Phrases and recordings stay." confirmLabel="Reset progress" onConfirm={() => void confirm()} onCancel={() => setDanger(undefined)} />
      ) : null}
      {danger === 'all' ? (
        <ConfirmDialog title="Clear all local data?" body="Everything on this device will be erased, including your own phrases, recordings and progress. The starter library then downloads again, which needs a connection. This cannot be undone." confirmLabel="Erase everything" onConfirm={() => void confirm()} onCancel={() => setDanger(undefined)} />
      ) : null}
      {danger === 'restore' ? (
        <ConfirmDialog title="Restore from this file?" body={`A backup from "${pendingFile?.name ?? 'this file'}" replaces everything currently on this device, including progress. Other Écoute ZIP files are merged in instead.`} confirmLabel="Restore" onConfirm={() => void confirm()} onCancel={() => setDanger(undefined)} />
      ) : null}
    </Page>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900 px-4 py-3">
      <h2 className="pb-1 text-sm font-semibold">{title}</h2>
      <div className="divide-y divide-ink-800/60">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-sm text-fg-soft">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  // Shows the new state at once, without waiting for the database write to come back.
  const [value, setValue] = useState(checked);
  useEffect(() => setValue(checked), [checked]);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2 text-sm text-fg-soft">
      {label}
      <input
        type="checkbox"
        role="switch"
        className="size-5 accent-teal"
        checked={value}
        onChange={(e) => {
          setValue(e.target.checked);
          onChange(e.target.checked);
        }}
      />
    </label>
  );
}
