"""Shared ffmpeg helpers for the audio pipeline."""
import subprocess

import imageio_ffmpeg
import numpy as np

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def load_16k(path) -> np.ndarray:
    """Decode any audio file to the 16 kHz mono float32 array Whisper expects."""
    out = subprocess.run(
        [FFMPEG, "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    )
    return np.frombuffer(out.stdout, dtype=np.float32)
