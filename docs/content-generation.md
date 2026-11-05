# How the content was made

## Curriculum

`content-source/` holds the curriculum as hand-editable text: 507 phrases in 12 collections and 216 vocabulary entries. It targets CEFR A1 in contemporary Metropolitan French. `npm run content:build` validates it and generates `public/content/library.json`, failing on duplicates, missing translations or broken links.

| Collection | Phrases |
|---|---|
| Greetings and introductions | 37 |
| Everyday conversations | 50 |
| Essential questions | 50 |
| Essential verbs | 67 |
| Daily routines | 46 |
| Work and professional life | 35 |
| Family and relationships | 32 |
| Food, restaurants and shopping | 42 |
| Places, directions and transportation | 37 |
| Feelings, health and needs | 32 |
| Numbers, time and dates | 28 |
| Natural spoken French | 51 |

Informal forms are separate entries, with an explanation and a link to their standard form. For example, `Je sais pas.` links to `Je ne sais pas.`

## Linguistic review, and its limits

All content was written by an AI (Claude). A second AI instance with fresh context then reviewed all 721 entries independently. It reported 38 findings (2 high, 12 medium, 24 low), such as the mistranslated `chercher` and the unidiomatic `Je vais à la pause café`. All 38 were applied.

**No native speaker, teacher or external reference has reviewed this content.** Neither review consulted a dictionary or corpus, and both AIs share similar blind spots. Treat naturalness claims as well-informed judgement rather than verified fact. A review by a native speaker would be the most valuable next step.

## Choosing the voice

No provider API keys were available, so only voices that run locally were compared. Each was judged by transcription, since the AI that made the choice can't hear audio.

| Voice | Result |
|---|---|
| **Piper `fr_FR-siwis-medium`** (chosen) | The most accurate on the first test, and nearly always correct on full phrases |
| Piper `fr_FR-tom-medium` | Slightly less accurate |
| Kokoro `ff_siwis` | Misheard words, such as `ça va` as `c'est va` and `il est` as `il a` |
| Chatterbox Multilingual on GPU | Rejected. It often added invented speech after the phrase, sometimes in English, with and without a French reference voice. It also crashed on very short inputs |

`edge-tts` was deliberately not used, because it's an unofficial client that imitates the Edge browser to reach a Microsoft service.

Natural sound is the main limitation. Piper is a 22 kHz neural voice and may sound less natural than commercial services. The speaker's accent hasn't been independently confirmed as Metropolitan. A paid service such as ElevenLabs may sound better. To switch, generate MP3s with the same filenames and rerun packaging, because everything else keys off the phrase ID.

## Correcting pronunciation without ears

The phonemes for all 939 items were dumped and read, which caught errors such as false liaisons (`parles anglais`, `T'es où`), wrong letters (`fils` as `fil`, `ben` as `bɛn`), a missing liaison (`vingt heures`) and over-formal linking (`je vais-z-au`).

`content-source/tts-overrides.txt` fixes about 80 of these by respelling what the voice receives, without changing the text you see. For example, `Tu parle anglais ?` removes the false liaison. `Il y a` is also respelled across the library so that it sounds like the single glide people actually say.

## Rebuilding the audio

Everything runs from a Python environment with CUDA PyTorch. Install from `scripts/audio-validation/requirements.txt`, then get the voice from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices).

```bash
npm run content:build
python scripts/audio-validation/generate_audio.py <voice.onnx> .
python scripts/audio-validation/verify_audio.py <models_dir> .
python scripts/audio-validation/retake_flagged.py <voice.onnx> <models_dir> .
npm run content:package
npm run content:check
```

| Step | What it does |
|---|---|
| `generate_audio.py` | Generates missing or changed recordings and logs failures. It reuses existing files, so it can be resumed |
| `verify_audio.py` | Technical checks, then transcription on the GPU with Whisper `large-v3` |
| `retake_flagged.py` | For each mismatch, tries up to 8 takes and keeps one that transcribes exactly. 97 were tried and 40 replaced. Text and voice never change |
| `content:package` | Writes the manifest and ZIP. It refuses to package if any recording failed the technical checks |
| `content:check` | Audits counts, IDs, translations and audio mapping |

`scripts/audio-validation/audio-manual-review.json` records the sound-alike classifications made by hand. `compare_voices.py` is the original CPU comparison, kept as a record. It also needs `kokoro-onnx` and `soundfile`.
