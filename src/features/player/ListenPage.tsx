import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, Eye, EyeOff, Keyboard, Loader2, Pause, Play, Repeat, RotateCcw, SkipBack, SkipForward, ListVideo } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { href } from '../../app/router';
import { PhraseDetails } from '../../components/PhraseDetails';
import { RatingBar } from '../../components/RatingBar';
import { Button, IconButton, Modal, Segmented, StatusBadge } from '../../components/ui';
import { toggleBookmark } from '../../database/repositories/phrases';
import { updateSettings } from '../../database/repositories/settings';
import { db } from '../../database/schema/db';
import { useEngine } from '../../hooks/useAudio';
import { useListeningLog } from '../../hooks/useListeningLog';
import { useSettings } from '../../hooks/useSettings';
import { engine } from '../../services/audio/engine';
import { incrementListen, ratePhrase } from '../../services/learning/review';
import { describeInterval } from '../../services/learning/scheduler';
import type { PlaybackSpeed, Rating } from '../../types';
import { BOOKMARKS_SOURCE, SPEED_OPTIONS, usePlayerQueue, type ListenMode } from './usePlayerQueue';
import { useShortcuts } from './useShortcuts';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['R', 'Replay from the start'],
  ['← / →', 'Previous or next phrase'],
  ['F', 'Show or hide French'],
  ['T', 'Show or hide English'],
  ['L', 'Repeat this phrase'],
  ['A', 'Automatic next phrase'],
  ['S', 'Next playback speed'],
  ['B', 'Bookmark'],
  ['1 to 4', 'Rate understanding'],
];

export function ListenPage() {
  const settings = useSettings();
  const [mode, setMode] = useState<ListenMode>('continuous');
  const queue = usePlayerQueue(mode);
  const { current, list, index } = queue;
  const audio = useEngine();
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), []);
  const dueCount = useLiveQuery(() => db.phrases.where('dueAt').between(1, Date.now(), true, true).count(), [mode, index]);
  const bookmarked = useLiveQuery(async () => (current ? Boolean(await db.bookmarks.get(current.id)) : false), [current?.id]);
  const [showFrench, setShowFrench] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [help, setHelp] = useState(false);
  const [rated, setRated] = useState<string>();

  useListeningLog(mode === 'review' ? 'review' : 'listen', queue.source);

  const autoAdvance = settings?.autoAdvance ?? false;
  const repeatCurrent = settings?.repeatCurrent ?? false;
  const gapMs = (settings?.autoAdvanceGapSeconds ?? 1.5) * 1000;

  // Default speed is applied once settings first load.
  const speedApplied = useRef(false);
  useEffect(() => {
    if (settings && !speedApplied.current) {
      speedApplied.current = true;
      engine.setSpeed(settings.defaultSpeed);
    }
  }, [settings]);

  // A flag rather than state, so moving via auto-advance keeps playing.
  const playOnLoad = useRef(false);
  const currentId = current?.id;
  const currentAudio = current?.audioId;

  useEffect(() => {
    setShowFrench(settings?.showTranscriptByDefault ?? false);
    setShowEnglish(settings?.showTranslationByDefault ?? false);
    setRated(undefined);
    if (!currentId) return;
    void engine.load(currentAudio, playOnLoad.current);
    playOnLoad.current = false;
    void engine.preload(list?.[index + 1]?.audioId);
    // Only a change of phrase should reset the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, currentAudio]);

  useEffect(() => () => engine.stop(), []);

  // End-of-recording behaviour: repeat, advance, or wait.
  // This reads current values through a ref and must not depend on them. Counting
  // a listen refreshes the phrase list, and re-running this effect at that moment
  // would cancel the pending timer, stopping repeat and auto-advance after one play.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ currentId, repeatCurrent, autoAdvance, gapMs, hasNext: false, next: queue.next });
  latest.current = { currentId, repeatCurrent, autoAdvance, gapMs, hasNext: Boolean(list && index < list.length - 1), next: queue.next };
  useEffect(() => {
    engine.onEnded = () => {
      const now = latest.current;
      if (now.currentId) void incrementListen(now.currentId);
      clearTimeout(timer.current);
      if (!now.repeatCurrent && !(now.autoAdvance && now.hasNext)) return;
      // Settings are read again when the timer fires, so a toggle during the pause counts.
      timer.current = setTimeout(() => {
        const then = latest.current;
        if (then.repeatCurrent) {
          void engine.replay();
        } else if (then.autoAdvance && then.hasNext) {
          playOnLoad.current = true;
          then.next();
        }
      }, now.gapMs);
    };
    return () => {
      engine.onEnded = null;
      clearTimeout(timer.current);
    };
  }, []);

  // Lock-screen and headset controls where the browser supports them.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: `Phrase ${index + 1} of ${list?.length ?? 0}`, artist: 'Écoute' });
    navigator.mediaSession.setActionHandler('play', () => void engine.play());
    navigator.mediaSession.setActionHandler('pause', () => engine.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => go(queue.previous));
    navigator.mediaSession.setActionHandler('nexttrack', () => go(queue.next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, index, list?.length, queue.next, queue.previous]);

  /** Manual navigation keeps playing if something was already playing. */
  const go = useCallback((move: () => void) => {
    clearTimeout(timer.current);
    playOnLoad.current = engine.getState().status === 'playing';
    move();
  }, []);

  const togglePlay = useCallback(() => {
    clearTimeout(timer.current);
    engine.toggle();
  }, []);

  const replay = useCallback(() => {
    clearTimeout(timer.current);
    void engine.replay();
  }, []);

  const setSpeed = (speed: PlaybackSpeed) => {
    engine.setSpeed(speed);
    void updateSettings({ defaultSpeed: speed });
  };

  const rate = async (rating: Rating) => {
    if (!current) return;
    const updated = await ratePhrase(current.id, rating, mode === 'review' ? 'review' : 'listen', Math.max(1, audio.plays));
    if (updated) setRated(`Next review ${describeInterval(updated)}.`);
    if (mode === 'review') {
      if (rating === 'unknown') queue.requeue(current.id);
      playOnLoad.current = true;
      queue.next();
    }
  };

  const cycleSpeed = () => {
    const at = SPEED_OPTIONS.indexOf(audio.speed);
    setSpeed(SPEED_OPTIONS[(at + 1) % SPEED_OPTIONS.length]!);
  };

  useShortcuts({
    ' ': togglePlay,
    r: replay,
    ArrowLeft: () => go(queue.previous),
    ArrowRight: () => go(queue.next),
    f: () => setShowFrench((v) => !v),
    t: () => setShowEnglish((v) => !v),
    l: () => void updateSettings({ repeatCurrent: !repeatCurrent }),
    a: () => void updateSettings({ autoAdvance: !autoAdvance }),
    s: cycleSpeed,
    b: () => current && void toggleBookmark(current.id),
    '1': () => void rate('unknown'),
    '2': () => void rate('difficult'),
    '3': () => void rate('repetition'),
    '4': () => void rate('immediate'),
    '?': () => setHelp(true),
  });

  const total = list?.length ?? 0;
  const loading = audio.status === 'loading';
  const playing = audio.status === 'playing';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-3 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select aria-label="Choose a collection" className="field min-w-0 sm:w-auto!" value={queue.source ?? ''} onChange={(e) => queue.selectSource(e.target.value)}>
          {collections?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
          <option value={BOOKMARKS_SOURCE}>Bookmarked phrases</option>
        </select>
        <Segmented<ListenMode>
          label="Listening mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'continuous', label: 'Listen' },
            { value: 'review', label: `Review${dueCount ? ` (${dueCount})` : ''}` },
          ]}
        />
      </div>

      {!current ? (
        <EmptyState mode={mode} isBookmarks={queue.source === BOOKMARKS_SOURCE} loading={!list} />
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between text-sm text-fg-muted">
            <span data-testid="position">
              {index + 1} of {total}
            </span>
            <StatusBadge status={current.status} />
          </div>
          <div className="mt-1.5 h-0.5 rounded-full bg-ink-800" role="progressbar" aria-label="Collection position" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
            <div className="h-full rounded-full bg-teal" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>

          <div className="flex flex-col items-center py-7 md:py-10">
            <button
              type="button"
              onClick={togglePlay}
              disabled={audio.status === 'missing'}
              aria-label={playing ? 'Pause' : 'Play'}
              data-state={audio.status}
              className="flex size-28 items-center justify-center rounded-full bg-teal text-ink-950 shadow-[0_0_0_8px_rgb(79_191_177/0.12)] transition-transform hover:bg-teal-soft active:scale-95 disabled:bg-ink-700 disabled:text-fg-muted disabled:shadow-none md:size-32"
            >
              {loading ? <Loader2 size={40} className="animate-spin" /> : playing ? <Pause size={44} fill="currentColor" /> : <Play size={44} fill="currentColor" className="ml-1.5" />}
            </button>
            <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full bg-teal-soft" data-testid="audio-progress" style={{ width: audio.duration ? `${Math.min(100, (audio.position / audio.duration) * 100)}%` : '0%' }} />
            </div>
            {audio.status === 'missing' ? <p className="mt-3 text-sm text-fg-muted">This phrase has no recording yet. You can add one in the Library.</p> : null}
            {audio.status === 'error' ? <p className="mt-3 text-sm text-rose" role="alert">This recording could not be played.</p> : null}
          </div>

          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <IconButton label="Previous phrase" disabled={index === 0} onClick={() => go(queue.previous)}>
              <SkipBack size={22} />
            </IconButton>
            <IconButton label="Replay from the start" onClick={replay}>
              <RotateCcw size={21} />
            </IconButton>
            <IconButton label="Repeat this phrase" aria-pressed={repeatCurrent} active={repeatCurrent} onClick={() => void updateSettings({ repeatCurrent: !repeatCurrent })}>
              <Repeat size={21} />
            </IconButton>
            <IconButton label="Automatic next phrase" aria-pressed={autoAdvance} active={autoAdvance} onClick={() => void updateSettings({ autoAdvance: !autoAdvance })}>
              <ListVideo size={21} />
            </IconButton>
            <IconButton label="Bookmark" aria-pressed={Boolean(bookmarked)} active={Boolean(bookmarked)} onClick={() => void toggleBookmark(current.id)}>
              <Bookmark size={21} fill={bookmarked ? 'currentColor' : 'none'} />
            </IconButton>
            <IconButton label="Next phrase" disabled={index >= total - 1} onClick={() => go(queue.next)}>
              <SkipForward size={22} />
            </IconButton>
          </div>

          <div className="mt-4 flex justify-center">
            <Segmented<PlaybackSpeed> label="Playback speed" value={audio.speed} onChange={setSpeed} options={SPEED_OPTIONS.map((s) => ({ value: s, label: s === 1 ? '1×' : `${s}×` }))} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Reveal label="French" shown={showFrench} onToggle={() => setShowFrench((v) => !v)}>
              <p lang="fr" className="french text-2xl leading-snug" data-testid="french">
                {current.french}
              </p>
            </Reveal>
            <Reveal label="English" shown={showEnglish} onToggle={() => setShowEnglish((v) => !v)}>
              <p className="text-lg leading-snug" data-testid="english">
                {current.english}
              </p>
            </Reveal>
          </div>
          {showFrench ? <PhraseDetails phrase={current} /> : null}

          <div className="mt-6">
            <p className="mb-2 text-sm text-fg-muted">{rated ?? (mode === 'review' ? 'How well did you understand?' : 'Optional: how well did you understand?')}</p>
            <RatingBar onRate={(r) => void rate(r)} showKeys />
          </div>

          <div className="mt-5 hidden justify-center md:flex">
            <Button variant="ghost" onClick={() => setHelp(true)}>
              <Keyboard size={16} /> Keyboard shortcuts
            </Button>
          </div>
        </>
      )}

      {help ? (
        <Modal title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">{k}</kbd>
                </dt>
                <dd className="text-fg-soft">{d}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      ) : null}
    </div>
  );
}

function Reveal({ label, shown, onToggle, children }: { label: string; shown: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-24 rounded-xl border border-ink-800 bg-ink-900 p-3">
      <button type="button" onClick={onToggle} aria-expanded={shown} className="flex w-full items-center justify-between text-sm font-medium text-fg-muted hover:text-fg">
        {shown ? `Hide ${label}` : `Show ${label}`}
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      {shown ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

function EmptyState({ mode, isBookmarks, loading }: { mode: ListenMode; isBookmarks: boolean; loading: boolean }) {
  if (loading) return <p className="mt-16 text-center text-fg-muted">Loading phrases</p>;
  return (
    <div className="mt-16 text-center">
      <p className="font-medium">{mode === 'review' ? 'Nothing is due for review here.' : isBookmarks ? 'No bookmarked phrases yet.' : 'This collection has no phrases yet.'}</p>
      <p className="mt-1 text-sm text-fg-muted">
        {mode === 'review' ? 'Rate phrases while you listen, and they will return here when they are due.' : isBookmarks ? 'Use the bookmark button while listening to save a phrase here.' : ''}
      </p>
      {mode !== 'review' && !isBookmarks ? (
        <a className="mt-3 inline-block text-sm text-teal-soft underline" href={href('library')}>
          Open the library
        </a>
      ) : null}
    </div>
  );
}
