# Audio manifest

`public/content/audio-manifest.json` lists every recording. The app attaches recordings by exact ID through this file and never matches filenames approximately.

| Field | Meaning |
|---|---|
| `id` | Phrase or vocabulary ID. Example sentences add `-ex`, as in `vocab-012-ex` |
| `file` | Path, such as `audio/greetings/greeting-001.mp3` |
| `kind` | `phrase`, `word` or `example` |
| `french`, `english` | The text as displayed |
| `provider`, `voice`, `language` | Piper, `fr_FR-siwis-medium`, `fr-FR` |
| `durationSeconds` | Length of the file |
| `status` | The strongest evidence for this file, as listed below |
| `heard`, `similarity` | What speech-to-text heard, and how closely it matched |

Files are 128 kbps mono MP3s at 22.05 kHz, with silence trimmed at the ends only and loudness evened out.

## What the 939 recordings have been through

| Stage | Count | What it means |
|---|---|---|
| Generated | 939 | Produced by the voice |
| Technically validated | 939 | Valid MP3, reasonable length and level, linked to the right ID, decodes in Chrome |
| Transcript matches exactly | 882 | Whisper `large-v3` heard the written words, ignoring case, accents and punctuation |
| Transcript differs, judged harmless | 32 | See the status table below |
| **Flagged for human listening** | **25** | See the list below |
| **Listened to by a person** | **0** | Nobody has listened to these recordings yet |

**A matching transcript doesn't prove good pronunciation.** It shows the right words can be recognised, not that the voice sounds natural. The AI that built this pipeline can't hear audio, so it has not judged naturalness, intonation or nasal vowels by ear. In place of listening, it read the phonemes generated for all 939 items and corrected the errors it found (see `content-generation.md`).

## Status values

| Status | Count | Meaning |
|---|---|---|
| `technical-ok-transcript-exact` | 882 | Transcript matches the text |
| `technical-ok-homophone-transcript` | 27 | The transcript is a spelling that sounds the same, such as `marié` and `mariée`. Judged from the spelling, not by listening |
| `technical-ok-number-format-transcript` | 3 | Whisper wrote the time or date in digits, such as `8h30` |
| `technical-ok-stt-normalized-informal-form` | 2 | Whisper rewrote the informal `Y a` as the standard `Il y a` |
| `technical-ok-needs-human-listening` | 25 | Whisper heard something else on every take tried |

## Recordings to check by ear

Very short utterances are hard to judge. Whisper has little to work with on a single word, so many of these may be fine, but word-initial `p` and `t` in this voice can also be weak. Each one ships with the best take available. If one sounds wrong, you can replace it through Edit phrase or the audio ZIP import.

| ID | Text | Whisper heard |
|---|---|---|
| question-001 | Qui ? | Si. |
| question-019 | Quand ? | Con. |
| spoken-010 | T'es où ? | C'est vous. |
| spoken-032 | Euh, je sais plus. | 1. Je sais plus. |
| vocab-116-ex | Je dois attendre ici. | Je dois t'attendre ici. |

**Single vocabulary words:** homme, parents, an, tôt, pain, thé, lait, gare, pays, aider, grand, bon, beau, vieux, table, pull, train, quand, en, ou.

Check `Quand ?` first. It came through as `Con`, which is a vulgar word.
