# Écoute

A personal French listening studio. It runs entirely in the browser with no backend or account, and it works offline after the first launch.

## Setup

You need [Node.js](https://nodejs.org) 24 or newer.

```bash
npm install
npm run build
npm run preview
```

Open <http://localhost:4173>. On first launch the app installs its whole library into the browser, which takes a few seconds and needs no action from you. After that it works offline.

To install it as an app, use the install icon in the Chrome or Edge address bar. On a phone, use "Add to Home Screen". Phones need the app served over HTTPS, so install from a deployed copy rather than from localhost.

For development with live reload, run `npm run dev`.

## Tests

```bash
npm test               # unit tests
npm run content:check  # audits phrases, vocabulary and audio in the package
npm run build
npm run test:e2e       # browser tests, using your installed Chrome
```

## Rebuilding content and audio

You only need this if you change the French content. Normal use and the setup above don't require Python.

| Step | Command |
|---|---|
| Validate `content-source/` and write the library | `npm run content:build` |
| Generate recordings | `python scripts/audio-validation/generate_audio.py <voice.onnx> .` |
| Check and transcribe recordings | `python scripts/audio-validation/verify_audio.py <models_dir> .` |
| Build the audio package | `npm run content:package` |

The audio scripts need Python 3.12 with `piper-tts`, `faster-whisper`, `imageio-ffmpeg` and `numpy`, plus the `fr_FR-siwis-medium` voice from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices).
