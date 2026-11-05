"""Generate every recording from content-source/audio-jobs.json.

Usage: python generate_audio.py <voice.onnx> <project_root> [--force]

Writes audio/<collection>/<id>.mp3 and audio-generation-log.json. Existing files
are skipped unless their TTS text changed, so a run can be resumed or repeated.
"""
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from audio_io import FFMPEG
from piper import PiperVoice

TARGET_RMS = 10 ** (-20 / 20)
PEAK_LIMIT = 10 ** (-1.5 / 20)
PAD_SECONDS = 0.12
SENTENCE_GAP = 0.4
SILENCE_THRESHOLD = 10 ** (-45 / 20)


def trim(audio: np.ndarray, rate: int) -> np.ndarray:
    """Removes silence at both ends only. Pauses inside the phrase are untouched."""
    window = max(1, int(rate * 0.01))
    env = np.convolve(np.abs(audio), np.ones(window) / window, mode="same")
    loud = np.nonzero(env > SILENCE_THRESHOLD)[0]
    if loud.size == 0:
        return audio
    keep = int(rate * 0.015)
    return audio[max(0, loud[0] - keep) : min(audio.size, loud[-1] + keep)]


def master(audio: np.ndarray, rate: int) -> np.ndarray:
    audio = trim(audio, rate)
    rms = float(np.sqrt(np.mean(audio**2)))
    gain = TARGET_RMS / rms if rms > 0 else 1.0
    peak = float(np.abs(audio).max()) * gain
    if peak > PEAK_LIMIT:
        gain *= PEAK_LIMIT / peak
    audio = audio * gain
    fade = int(rate * 0.005)
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    audio[:fade] *= ramp
    audio[-fade:] *= ramp[::-1]
    pad = np.zeros(int(rate * PAD_SECONDS), dtype=np.float32)
    return np.concatenate([pad, audio, pad])


def synthesize(voice: PiperVoice, text: str) -> tuple[np.ndarray, int]:
    parts: list[np.ndarray] = []
    rate = voice.config.sample_rate
    for i, chunk in enumerate(voice.synthesize(text)):
        rate = chunk.sample_rate
        if i:
            parts.append(np.zeros(int(rate * SENTENCE_GAP), dtype=np.float32))
        parts.append(chunk.audio_float_array.astype(np.float32))
    if not parts:
        raise RuntimeError("voice produced no audio")
    return np.concatenate(parts), rate


def encode(audio: np.ndarray, rate: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(rate), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", "128k", "-ac", "1", "-map_metadata", "-1", "-id3v2_version", "0", str(path)],
        input=audio.astype(np.float32).tobytes(),
        check=True,
        capture_output=True,
    )


def main() -> None:
    voice_path, root = sys.argv[1], Path(sys.argv[2])
    force = "--force" in sys.argv
    jobs = json.loads((root / "content-source" / "audio-jobs.json").read_text(encoding="utf-8"))
    log_path = root / "scripts" / "audio-validation" / "audio-generation-log.json"
    log = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else {}
    voice = PiperVoice.load(voice_path)
    start = time.time()
    made = skipped = 0
    failures = []
    for n, job in enumerate(jobs, 1):
        path = root / job["file"]
        digest = hashlib.sha1(job["tts"].encode()).hexdigest()
        prior = log.get(job["id"], {})
        if not force and path.exists() and prior.get("digest") == digest:
            skipped += 1
            continue
        for attempt in (1, 2):
            try:
                audio, rate = synthesize(voice, job["tts"])
                final = master(audio, rate)
                encode(final, rate, path)
                log[job["id"]] = {"digest": digest, "seconds": round(final.size / rate, 3), "attempts": attempt}
                made += 1
                break
            except Exception as error:  # Recorded and retried once, then reported.
                if attempt == 2:
                    failures.append({"id": job["id"], "error": str(error)})
        if n % 100 == 0:
            print(f"{n}/{len(jobs)} {time.time() - start:.0f}s", flush=True)
            log_path.write_text(json.dumps(log, indent=0), encoding="utf-8")
    log_path.write_text(json.dumps(log, indent=0), encoding="utf-8")
    print(f"generated {made}, unchanged {skipped}, failed {len(failures)}, {time.time() - start:.0f}s")
    for f in failures:
        print("FAILED", f)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
