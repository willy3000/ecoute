# Testing report

Tested on 5 November 2026 on Windows 11, using the production build in Chrome through Playwright, on the latest package.

| Suite | Result | Command |
|---|---|---|
| Unit and integration | 31 of 31 passed | `npm test` |
| Browser, end to end | 29 of 29 passed | `npm run test:e2e` |
| Package audit | Passed | `npm run content:check` |
| Type check and production build | Passed | `npm run build` |

## Covered by the browser tests

- **First launch:** the library installs by itself, every item links to its own recording, and all 939 recordings decode in Chrome.
- **Player:** real playback, pause, resume, replay, repeat, automatic next, speed with pitch preserved, reveal toggles, keyboard shortcuts, bookmarks, and remembering your place after a reload.
- **Learning:** ratings, review scheduling and the review queue, plus all four practice modes and the statistics they produce.
- **Library:** creating, editing and deleting collections and phrases, CSV and JSON import, export, search, filters, sorting, and the vocabulary manager.
- **Data:** settings, full backup and exact restore, resetting progress, and clearing all data after confirmation.
- **Offline:** with the network off, the app reloads, navigates, plays audio, saves ratings and bookmarks, shows statistics and exports a backup. All of that survives a real browser restart while still offline.
- **Installability:** a valid web manifest and icons.
- **Mobile:** no horizontal scrolling on any main screen at 360 px, and touch playback works.
- **Errors:** no console or page errors across the main session.

The unit tests also cover scheduling intervals, dictation scoring, statistics, migrations with data preserved, seeding that never overwrites progress, exact-ID audio matching, and rejecting a damaged backup with no data changed.

## Bugs found and fixed through testing

| Bug | Effect |
|---|---|
| Repeat and automatic next stopped after one play | Counting a listen refreshed the phrase list, which cancelled the pending timer |
| Creating a collection did nothing | The dialog closed as if the save had worked, but nothing was saved |
| Install failed on compressed responses, with "offset is out of bounds" | The download buffer was sized from `Content-Length`, which gives the compressed size. Retested with a local server that compresses the same way |
| "Collection order" sorted collections alphabetically | The phrase list started at "Everyday" instead of "Greetings" |
| Settings toggles briefly snapped back | They waited for the database write to finish |

## Not tested

- **Human listening:** no person has listened to the recordings. See `audio-manifest.md`, including the 25 flagged for checking.
- **Other browsers:** Safari, Firefox, and real iPhone and Android devices weren't tested. iOS Safari has its own storage and audio rules, so it's the most likely place for problems. Automated phone-size tests used Chrome's device emulation.
- **Real microphone:** shadowing was tested with Chrome's simulated microphone.
- **The install prompt itself:** the manifest and service worker were checked, but nobody clicked "Install".
- **The deployed Netlify site:** these tests ran against a local build. The owner reports that the Netlify deployment works.
- **Long-term storage:** Chrome was tested through a restart, but not whether browsers keep the data over months under storage pressure. Keep a backup.
