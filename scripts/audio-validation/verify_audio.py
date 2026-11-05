"""Check every recording technically, then transcribe it independently on the GPU.

Usage: python verify_audio.py <models_dir> <project_root> [whisper_model]

Needs an environment with CUDA PyTorch, whose libraries faster-whisper uses. Writes
scripts/audio-validation/audio-verification.json. A transcript match is evidence
the recording says the right words. It is not proof of good pronunciation, and
single words are too short for it to mean much.
"""
import difflib
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

import numpy as np
import torch

torch_lib = Path(torch.__file__).parent / "lib"
os.add_dll_directory(str(torch_lib))
os.environ["PATH"] = str(torch_lib) + os.pathsep + os.environ["PATH"]

from audio_io import load_16k
from faster_whisper import WhisperModel

MP3_SYNC = (b"\xff\xf3", b"\xff\xf2", b"\xff\xfb", b"\xff\xfa", b"ID3")
NUMBERS = {"1": "un", "2": "deux", "3": "trois", "4": "quatre", "5": "cinq", "6": "six", "7": "sept", "8": "huit", "9": "neuf", "10": "dix", "11": "onze", "14": "quatorze", "17": "dix sept", "18": "dix huit", "20": "vingt", "25": "vingt cinq", "30": "trente", "40": "quarante", "100": "cent"}


def norm(text: str) -> str:
    text = text.lower().replace("œ", "oe").replace("’", " ").replace("'", " ")
    text = re.sub(r"(\d+)\s*h(?![a-z])\s*(\d*)", lambda m: f"{m[1]} heures {m[2]}", text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    words = re.sub(r"[^a-z0-9]+", " ", text).split()
    return " ".join(NUMBERS.get(w, w) for w in words)


def main() -> None:
    models, root = Path(sys.argv[1]), Path(sys.argv[2])
    model_name = sys.argv[3] if len(sys.argv) > 3 else "large-v3"
    jobs = json.loads((root / "content-source" / "audio-jobs.json").read_text(encoding="utf-8"))
    stt = WhisperModel(model_name, device="cuda", compute_type="float16", download_root=str(models / "whisper"))
    start = time.time()
    results = []
    for n, job in enumerate(jobs, 1):
        path = root / job["file"]
        r = {"id": job["id"], "kind": job["kind"], "source": job["source"], "technical": False, "problems": []}
        if not path.exists():
            r["problems"].append("missing file")
        elif path.stat().st_size < 1000:
            r["problems"].append("file too small")
        elif not path.read_bytes()[:3].startswith(MP3_SYNC):
            r["problems"].append("not MP3")
        else:
            try:
                audio = load_16k(path)
                seconds = audio.size / 16000
                r["seconds"] = round(seconds, 3)
                r["peak"] = round(float(np.abs(audio).max()), 3)
                words = max(1, len(norm(job["source"]).split()))
                if not 0.35 <= seconds <= 1.0 + words * 0.9:
                    r["problems"].append(f"duration {seconds:.2f}s is odd for {words} words")
                if r["peak"] < 0.1:
                    r["problems"].append("nearly silent")
                r["technical"] = not r["problems"]
                segs, _ = stt.transcribe(audio, language="fr", beam_size=5, condition_on_previous_text=False, vad_filter=False)
                heard = " ".join(s.text.strip() for s in segs)
                r["heard"] = heard
                r["similarity"] = round(difflib.SequenceMatcher(None, norm(job["source"]), norm(heard)).ratio(), 3)
                r["exact"] = norm(job["source"]) == norm(heard)
            except Exception as error:
                r["problems"].append(f"decode failed: {error}")
        results.append(r)
        if n % 100 == 0:
            print(f"{n}/{len(jobs)} {time.time() - start:.0f}s", flush=True)
    out = root / "scripts" / "audio-validation" / "audio-verification.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"model {model_name} on GPU, {time.time() - start:.0f}s")
    print("technical ok:", sum(r["technical"] for r in results), "of", len(results))
    print("exact transcript:", sum(bool(r.get("exact")) for r in results))
    for r in results:
        if r["problems"]:
            print("PROBLEM", r["id"], r["problems"])


if __name__ == "__main__":
    main()
