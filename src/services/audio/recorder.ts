/** Thin wrapper over MediaRecorder for shadowing practice. Nothing leaves the device. */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];

  static isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    const recorder = new MediaRecorder(this.stream);
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });
    recorder.start();
    this.recorder = recorder;
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error('Not recording'));
    return new Promise((resolve) => {
      recorder.addEventListener(
        'stop',
        () => {
          this.release();
          resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
        },
        { once: true },
      );
      recorder.stop();
    });
  }

  /** Stops the microphone without keeping a recording. */
  cancel(): void {
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.release();
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
