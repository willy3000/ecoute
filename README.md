# Écoute

A personal French listening studio with 507 phrases, 216 vocabulary words and 939 recordings. It runs entirely in the browser with no backend or account, and it works offline after the first launch.

## Setup

You need [Node.js](https://nodejs.org). It has been tested on version 24.

```bash
npm install
npm run build
npm run preview
```

Open <http://localhost:4173>. On first launch the app installs its whole library into the browser, which takes a few seconds and needs no action from you. After that it works offline.

For development with live reload, run `npm run dev` instead.

To install it as an app, use the install icon in the Chrome or Edge address bar. On a phone, use "Add to Home Screen". Phones need the app served over HTTPS, so install from a deployed copy rather than from localhost.

## Deploying

Any static host works. On Netlify, use the build command `npm run build` and the publish directory `dist`.

## Documentation

| Document | Contents |
|---|---|
| [User guide](docs/user-guide.md) | Using the app, adding phrases and recordings, backup and restore |
| [Architecture](docs/architecture.md) | How the app is built |
| [Content generation](docs/content-generation.md) | How the French and audio were made, and how to rebuild them |
| [Audio manifest](docs/audio-manifest.md) | Recording statuses, and the 25 to check by ear |
| [Testing report](docs/testing-report.md) | What was tested, and what wasn't |

## Tests

```bash
npm test               # unit tests
npm run content:check  # audits phrases, vocabulary and audio in the package
npm run build
npm run test:e2e       # browser tests, using your installed Chrome
```

## Known limitations

- Nobody has listened to the recordings yet, and 25 are flagged for checking by ear.
- The French was written and reviewed by AI, not by a native speaker.
- It has only been tested in Chrome. Safari and real phones are untested.
