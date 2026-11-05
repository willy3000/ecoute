import { db } from '../../database/schema/db';
import type { PlaybackSpeed } from '../../types';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'missing' | 'error';

export interface EngineState {
  status: EngineStatus;
  audioId?: string;
  position: number;
  duration: number;
  speed: PlaybackSpeed;
  /** Plays of the current recording since it was loaded. */
  plays: number;
}

type EndedHandler = (audioId: string) => void;

const CACHE_SIZE = 8;

/**
 * Single audio element shared by the whole app, so two recordings can never
 * overlap. Object URLs for recent and upcoming recordings stay cached, which
 * makes moving between phrases effectively instant.
 */
class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private urls = new Map<string, string>();
  private listeners = new Set<() => void>();
  private loadToken = 0;
  private lastTime = 0;
  private heardSeconds = 0;
  private playCount = 0;
  state: EngineState = { status: 'idle', position: 0, duration: 0, speed: 1, plays: 0 };
  onEnded: EndedHandler | null = null;

  private audio(): HTMLAudioElement {
    if (this.el) return this.el;
    const el = new Audio();
    el.preload = 'auto';
    el.preservesPitch = true;
    el.addEventListener('playing', () => this.set({ status: 'playing' }));
    el.addEventListener('pause', () => {
      if (!el.ended && this.state.status === 'playing') this.set({ status: 'paused' });
    });
    el.addEventListener('timeupdate', () => {
      const delta = el.currentTime - this.lastTime;
      // Real elapsed listening time, so slow playback counts for what it took.
      if (delta > 0 && delta < 2) this.heardSeconds += delta / (el.playbackRate || 1);
      this.lastTime = el.currentTime;
      this.set({ position: el.currentTime });
    });
    el.addEventListener('durationchange', () => {
      if (Number.isFinite(el.duration)) this.set({ duration: el.duration });
    });
    el.addEventListener('ended', () => {
      this.playCount += 1;
      this.set({ status: 'ready', position: 0, plays: this.state.plays + 1 });
      if (this.state.audioId) this.onEnded?.(this.state.audioId);
    });
    el.addEventListener('error', () => {
      if (el.getAttribute('src')) this.set({ status: 'error' });
    });
    this.el = el;
    return el;
  }

  private set(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): EngineState => this.state;

  private async urlFor(audioId: string): Promise<string | undefined> {
    const cached = this.urls.get(audioId);
    if (cached) {
      this.urls.delete(audioId);
      this.urls.set(audioId, cached);
      return cached;
    }
    const row = await db.audio.get(audioId);
    if (!row) return undefined;
    const url = URL.createObjectURL(row.blob);
    this.urls.set(audioId, url);
    while (this.urls.size > CACHE_SIZE) {
      const oldest = [...this.urls.entries()].find(([id]) => id !== this.state.audioId);
      if (!oldest) break;
      URL.revokeObjectURL(oldest[1]);
      this.urls.delete(oldest[0]);
    }
    return url;
  }

  /** Warm the cache so the next recording starts without waiting on the database. */
  async preload(audioId: string | undefined): Promise<void> {
    if (audioId) await this.urlFor(audioId);
  }

  /** Loads a recording and optionally starts it. Stale requests are dropped. */
  async load(audioId: string | undefined, autoplay = false): Promise<void> {
    const token = ++this.loadToken;
    const el = this.audio();
    el.pause();
    this.lastTime = 0;
    if (!audioId) {
      el.removeAttribute('src');
      el.load();
      this.set({ status: 'missing', audioId: undefined, position: 0, duration: 0, plays: 0 });
      return;
    }
    this.set({ status: 'loading', audioId, position: 0, duration: 0, plays: 0 });
    const url = await this.urlFor(audioId);
    if (token !== this.loadToken) return;
    if (!url) {
      this.set({ status: 'missing' });
      return;
    }
    el.src = url;
    el.playbackRate = this.state.speed;
    el.defaultPlaybackRate = this.state.speed;
    el.preservesPitch = true;
    if (autoplay) await this.play();
    else this.set({ status: 'ready' });
  }

  async play(): Promise<void> {
    const el = this.audio();
    if (!el.getAttribute('src')) return;
    const token = this.loadToken;
    try {
      el.playbackRate = this.state.speed;
      await el.play();
    } catch (error) {
      // AbortError only means a newer load replaced this one.
      if (token === this.loadToken && (error as DOMException).name !== 'AbortError') {
        // Autoplay can be refused before a user gesture; the play button still works.
        this.set({ status: 'ready' });
      }
    }
  }

  pause(): void {
    this.el?.pause();
  }

  toggle(): void {
    if (this.state.status === 'playing') this.pause();
    else void this.play();
  }

  async replay(): Promise<void> {
    const el = this.audio();
    if (!el.getAttribute('src')) return;
    el.currentTime = 0;
    this.lastTime = 0;
    await this.play();
  }

  seek(seconds: number): void {
    const el = this.audio();
    el.currentTime = seconds;
    this.lastTime = seconds;
    this.set({ position: seconds });
  }

  setSpeed(speed: PlaybackSpeed): void {
    if (this.el) {
      this.el.playbackRate = speed;
      this.el.defaultPlaybackRate = speed;
    }
    this.set({ speed });
  }

  stop(): void {
    this.loadToken++;
    this.el?.pause();
    this.set({ status: 'idle', audioId: undefined, position: 0, duration: 0, plays: 0 });
  }

  /** Returns and resets what has been heard since the last call. */
  takeListened(): { seconds: number; plays: number } {
    const result = { seconds: this.heardSeconds, plays: this.playCount };
    this.heardSeconds = 0;
    this.playCount = 0;
    return result;
  }

  clearCache(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

export const engine = new AudioEngine();
