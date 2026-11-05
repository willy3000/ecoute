"""Write the exact phonemes the Piper voice will speak for every audio job.

Usage: python dump_phonemes.py <voice.onnx> <audio-jobs.json> <out.tsv>

Reviewing these catches liaison and silent-letter errors in the text front end,
which matters because the pipeline has no human ear in it.
"""
import json
import sys
from pathlib import Path

from piper import PiperVoice


def main() -> None:
    voice = PiperVoice.load(sys.argv[1])
    jobs = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    with open(sys.argv[3], "w", encoding="utf-8") as out:
        for j in jobs:
            ph = " | ".join("".join(s) for s in voice.phonemize(j["tts"]))
            out.write(f"{j['id']}\t{j['source']}\t{j['tts']}\t{ph}\n")


if __name__ == "__main__":
    main()
