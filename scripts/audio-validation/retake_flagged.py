"""Regenerate unclear recordings and keep a take that transcribes correctly.

Usage: python retake_flagged.py <voice.onnx> <models_dir> <project_root>

Synthesis varies slightly per run. For every recording whose transcript differs
from its text, this tries several takes and replaces the file only when a take
transcribes exactly. Otherwise the original stays and remains flagged. Whisper
runs on the GPU. Text and voice never change, only the take.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

import numpy as np
import torch

torch_lib = Path(torch.__file__).parent / "lib"
os.add_dll_directory(str(torch_lib))
os.environ["PATH"] = str(torch_lib) + os.pathsep + os.environ["PATH"]

from audio_io import load_16k
from faster_whisper import WhisperModel
from generate_audio import encode, master
from piper import PiperVoice
from piper.config import SynthesisConfig
from verify_audio import norm
import difflib
import hashlib

# Noise scale, duration noise, and length: the default first, then gentle variations.
SETTINGS = [(0.667, 0.8, 1.0), (0.667, 0.8, 1.0), (0.5, 0.6, 1.0), (0.8, 0.8, 1.0), (0.667, 0.8, 1.05), (0.5, 0.6, 1.05), (0.4, 0.5, 1.1), (0.667, 0.8, 1.1)]
SENTENCE_GAP = 0.4


def synth(voice: PiperVoice, text: str, cfg: SynthesisConfig) -> tuple[np.ndarray, int]:
    parts: list[np.ndarray] = []
    rate = voice.config.sample_rate
    for i, chunk in enumerate(voice.synthesize(text, syn_config=cfg)):
        rate = chunk.sample_rate
        if i:
            parts.append(np.zeros(int(rate * SENTENCE_GAP), dtype=np.float32))
        parts.append(chunk.audio_float_array.astype(np.float32))
    return np.concatenate(parts), rate


def main() -> None:
    voice_path, models, root = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    jobs = {j["id"]: j for j in json.loads((root / "content-source/audio-jobs.json").read_text(encoding="utf-8"))}
    ver_path = root / "scripts/audio-validation/audio-verification.json"
    log_path = root / "scripts/audio-validation/audio-generation-log.json"
    verification = json.loads(ver_path.read_text(encoding="utf-8"))
    log = json.loads(log_path.read_text(encoding="utf-8"))
    voice = PiperVoice.load(voice_path)
    stt = WhisperModel("large-v3", device="cuda", compute_type="float16", download_root=str(models / "whisper"))
    tmp = root / "scripts/audio-validation/.take.mp3"

    def hear(path: Path) -> str:
        segs, _ = stt.transcribe(load_16k(path), language="fr", beam_size=5, condition_on_previous_text=False)
        return " ".join(s.text.strip() for s in segs)

    start = time.time()
    fixed = tried = 0
    for r in verification:
        # The corrected scorer may now accept what the old one rejected.
        if r.get("heard") is not None:
            r["exact"] = norm(r["source"]) == norm(r["heard"])
            r["similarity"] = round(difflib.SequenceMatcher(None, norm(r["source"]), norm(r["heard"])).ratio(), 3)
        if r.get("exact"):
            continue
        job = jobs[r["id"]]
        target = norm(job["source"])
        tried += 1
        for noise, noise_w, length in SETTINGS:
            cfg = SynthesisConfig(noise_scale=noise, noise_w_scale=noise_w, length_scale=length)
            audio, rate = synth(voice, job["tts"], cfg)
            final = master(audio, rate)
            encode(final, rate, tmp)
            heard = hear(tmp)
            if norm(heard) == target:
                os.replace(tmp, root / job["file"])
                r.update(heard=heard, exact=True, similarity=1.0, seconds=round(final.size / rate, 3), retake=True)
                log[job["id"]] = {"digest": hashlib.sha1(job["tts"].encode()).hexdigest(), "seconds": r["seconds"], "attempts": 1, "take": {"noise": noise, "noiseW": noise_w, "length": length}}
                fixed += 1
                print(f"FIXED {job['id']} {job['source']} ({noise}, {noise_w}, {length})", flush=True)
                break
        else:
            print(f"KEPT  {job['id']} {job['kind']} {job['source']} => {r.get('heard')}", flush=True)
    tmp.unlink(missing_ok=True)
    ver_path.write_text(json.dumps(verification, ensure_ascii=False, indent=0), encoding="utf-8")
    log_path.write_text(json.dumps(log, indent=0), encoding="utf-8")
    print(f"tried {tried}, fixed {fixed}, {time.time() - start:.0f}s")


if __name__ == "__main__":
    main()
