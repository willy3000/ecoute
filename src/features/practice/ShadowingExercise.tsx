import { Mic, Pause, Play, Repeat2, SkipForward, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { engine } from '../../services/audio/engine';
import { VoiceRecorder } from '../../services/audio/recorder';
import type { Deck } from './useDeck';
import { BigPlay, DeckProgress, Finished, usePracticeAudio } from './shared';

/** Listen and repeat aloud. The recording stays in memory and is never saved or sent. */
export function ShadowingExercise({ deck }: { deck: Deck }) {
  const phrase = deck.current;
  usePracticeAudio('shadowing', phrase, false);

  const recorder = useRef(new VoiceRecorder());
  const mine = useRef<HTMLAudioElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string>();
  const [mineStatus, setMineStatus] = useState<'idle' | 'playing'>('idle');
  const [error, setError] = useState<string>();
  const [showText, setShowText] = useState(false);
  const id = phrase?.id;

  const clearRecording = () => {
    setUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return undefined;
    });
    mine.current?.pause();
    setMineStatus('idle');
  };

  useEffect(() => {
    clearRecording();
    setShowText(false);
    setError(undefined);
  }, [id]);

  useEffect(() => {
    const r = recorder.current;
    return () => {
      r.cancel();
      mine.current?.pause();
    };
  }, []);

  if (deck.finished || !phrase) return <Finished deck={deck} />;

  const toggleRecording = async () => {
    setError(undefined);
    if (recording) {
      const blob = await recorder.current.stop();
      setRecording(false);
      setUrl(URL.createObjectURL(blob));
      return;
    }
    clearRecording();
    engine.pause();
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('The microphone is unavailable. Allow access in your browser, or just repeat aloud.');
    }
  };

  const playMine = () => new Promise<void>((resolve) => {
    if (!url) return resolve();
    if (mine.current) mine.current.pause();
    const a = new Audio(url);
    mine.current = a;
    setMineStatus('playing');
    const done = () => {
      setMineStatus('idle');
      resolve();
    };
    a.addEventListener('ended', done, { once: true });
    a.addEventListener('pause', done, { once: true });
    a.addEventListener('error', done, { once: true });
    void a.play().catch(done);
  });

  /** Native recording, then the learner's, for a direct comparison. */
  const compare = async () => {
    mine.current?.pause();
    const previous = engine.onEnded;
    await new Promise<void>((resolve) => {
      engine.onEnded = (a) => {
        previous?.(a);
        engine.onEnded = previous;
        resolve();
      };
      void engine.replay();
    });
    await playMine();
  };

  return (
    <>
      <DeckProgress deck={deck} />
      <div className="mt-8 flex flex-col items-center">
        <BigPlay />
        <p className="mt-3 text-sm text-fg-muted">Native recording</p>
      </div>

      <div className="mt-6 rounded-xl border border-ink-800 bg-ink-900 p-4 text-center">
        {showText ? (
          <>
            <p lang="fr" className="french text-2xl" data-testid="french">{phrase.french}</p>
            <p className="mt-1 text-fg-soft">{phrase.english}</p>
            {phrase.pronunciationNotes ? <p className="mt-2 text-sm text-fg-muted">{phrase.pronunciationNotes}</p> : null}
          </>
        ) : (
          <Button variant="ghost" onClick={() => setShowText(true)}>
            Show the words
          </Button>
        )}
      </div>

      {VoiceRecorder.isSupported() ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant={recording ? 'danger' : 'primary'} onClick={() => void toggleRecording()}>
            {recording ? <Square size={16} /> : <Mic size={16} />}
            {recording ? 'Stop recording' : url ? 'Record again' : 'Record myself'}
          </Button>
          {url ? (
            <>
              <Button onClick={() => (mineStatus === 'playing' ? mine.current?.pause() : void playMine())} data-testid="play-mine">
                {mineStatus === 'playing' ? <Pause size={16} /> : <Play size={16} />} My recording
              </Button>
              <Button onClick={() => void compare()}>
                <Repeat2 size={16} /> Compare
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-fg-muted">Recording is not supported in this browser, but you can still repeat aloud.</p>
      )}
      {recording ? <p className="mt-2 text-center text-sm text-rose" role="status">Recording. Repeat the phrase now.</p> : null}
      {error ? <p className="mt-2 text-center text-sm text-rose" role="alert">{error}</p> : null}
      {url ? <p className="mt-2 text-center text-xs text-fg-muted">Your recording stays on this page and is discarded when you move on.</p> : null}

      <div className="mt-6 flex justify-center">
        <Button variant="ghost" onClick={deck.advance}>
          Next phrase <SkipForward size={16} />
        </Button>
      </div>
    </>
  );
}
