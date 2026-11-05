"""Compare candidate local French voices on a fixed test set.

Usage: python compare_voices.py <models_dir> <out_dir>

For each candidate it writes one WAV per sentence, then transcribes it with
faster-whisper and prints the raw transcript beside the source. This is an
objective intelligibility signal only. It does not measure how natural a voice
sounds, which needs a human listener.
"""
import re
import sys
import time
import unicodedata
import wave
from pathlib import Path

import soundfile as sf
from audio_io import load_16k
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro
from piper import PiperVoice

SENTENCES = [
    "Bonjour, comment ça va ?",
    "Je viens de rentrer.",
    "Il est huit heures et demie.",
    "Nous avons une petite maison.",
    "Est-ce qu'il y a une pharmacie près d'ici ?",
    "Je voudrais un kilo de pommes, s'il vous plaît.",
    "Ils ont une voiture.",
    "Ils sont en vacances.",
    "T'as vu ?",
    "Y a quelqu'un ?",
    "Ouais, c'est pas grave.",
    "Je ne me sens pas bien.",
    "Vous faites quoi dans la vie ?",
    "Mon fils a six ans.",
    "Qu'est-ce que tu veux dire ?",
    "J'ai mal à la tête.",
]


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def main() -> None:
    models, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    timings: dict[str, float] = {}

    kokoro = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
    print("kokoro french voices:", [v for v in kokoro.get_voices() if v.startswith("ff")])
    start = time.time()
    for i, s in enumerate(SENTENCES):
        audio, rate = kokoro.create(s, voice="ff_siwis", speed=1.0, lang="fr-fr")
        sf.write(out / f"kokoro_{i:02}.wav", audio, rate)
    timings["kokoro"] = time.time() - start

    for name in ("siwis", "tom"):
        voice = PiperVoice.load(str(models / f"fr_FR-{name}-medium.onnx"))
        start = time.time()
        for i, s in enumerate(SENTENCES):
            with wave.open(str(out / f"piper-{name}_{i:02}.wav"), "wb") as w:
                voice.synthesize_wav(s, w)
        timings[f"piper-{name}"] = time.time() - start

    print("synthesis seconds:", {k: round(v, 1) for k, v in timings.items()})
    stt = WhisperModel("small", device="cpu", compute_type="int8", download_root=str(models / "whisper"))
    for cand in timings:
        ok = 0
        print(f"\n=== {cand}")
        for i, s in enumerate(SENTENCES):
            segs, _ = stt.transcribe(load_16k(out / f"{cand}_{i:02}.wav"), language="fr", beam_size=5, condition_on_previous_text=False)
            got = " ".join(x.text.strip() for x in segs)
            same = norm(got) == norm(s)
            ok += same
            print(f"{'OK ' if same else 'DIFF'} {s}  ->  {got}")
        print(f"exact (normalized): {ok}/{len(SENTENCES)}")


if __name__ == "__main__":
    main()
