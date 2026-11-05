# Architecture

Écoute is a frontend-only, local-first Progressive Web App. There is no server, account or runtime API. A static host delivers the files once, and after that the app runs from the browser's own storage.

**Stack:** React, TypeScript (strict), Vite, Tailwind CSS, Dexie on IndexedDB, Lucide icons, fflate for ZIP, and vite-plugin-pwa with Workbox.

## How the pieces fit

```
Static host ──► service worker cache (app shell, library.json, manifest)
            └─► ecoute-audio-v1.zip (fetched once on first launch)
                        │ unzipped and joined by manifest ID
                        ▼
                  IndexedDB (Dexie)
                  ▲               ▲
   services (audio, import,       features (player, library,
   export, learning)  ◄────────── practice, vocabulary, progress, settings)
```

The audio ZIP is deliberately left out of the service worker cache. Recordings live in IndexedDB as Blobs, and caching the ZIP as well would store all of them twice.

## Source layout

| Path | Contents |
|---|---|
| `src/app/` | App boot, first-launch setup screen, navigation shell, hash router |
| `src/components/` | Shared UI |
| `src/features/` | One folder per screen area |
| `src/database/` | Dexie schema, migrations and repositories |
| `src/services/audio/` | The playback engine and the microphone recorder |
| `src/services/import/`, `export/` | Seeding, CSV, JSON, ZIP and backup |
| `src/services/learning/` | Scheduler, review actions, dictation comparison, statistics |
| `content-source/` | Hand-written curriculum, the source of truth |
| `audio/` | Master MP3s, named by phrase ID |
| `public/content/` | Generated `library.json`, `audio-manifest.json` and the audio ZIP |
| `scripts/` | Content validation, audio generation and verification, packaging |
| `e2e/` | Playwright browser tests |

## Database

The Dexie database `ecoute` has eight tables, with types in `src/types/index.ts`:

| Table | Key and main indexes | Holds |
|---|---|---|
| `collections` | `id`, `order` | Built-in and user collections |
| `phrases` | `id`, `[collectionId+order]`, `status`, `dueAt`, `*vocabularyTags` | Phrase content and its learning state |
| `audio` | `id` | Recording Blobs and their metadata |
| `vocabulary` | `id`, `category`, `status` | Words |
| `reviews` | auto, `phraseId`, `day` | One row per rating |
| `sessions` | auto, `day` | Listening time |
| `bookmarks` | `phraseId` | Saved phrases |
| `settings` | `key` | One row per setting |

To change the schema, append a version in `src/database/migrations/index.ts` and never edit a released one. `src/database/database.test.ts` proves an upgrade keeps existing data.

## Key decisions

**One audio element.** `services/audio/engine.ts` owns a single `Audio` object, so two recordings can never overlap. It keeps recent and upcoming recordings ready as object URLs, which makes moving between phrases effectively instant, and drops stale load requests. `preservesPitch` stays on, so changing speed doesn't change the voice's pitch.

**Exact audio mapping.** Recordings attach only through the manifest's ID or an exact phrase ID. Filenames are never matched approximately.

**Seeding never overwrites learning.** `mergeLibrary` adds what's missing and refreshes built-in text, but leaves learning state alone and skips anything the user edited. That makes rerunning it safe, so an interrupted first launch can simply retry.

**Restores are all-or-nothing.** A backup is fully checked before anything changes, then applied in one transaction, so a damaged file can't leave a half-restored library.

**Hash routing.** Routes such as `#/library/phrases` work on any static host, under any subpath and offline, with no server rewrites. The Vite `base` is relative for the same reason.

**Fonts are bundled.** Inter and Newsreader ship through `@fontsource`, so the app never fetches them from the network.

## Adding AI features later

Nothing in the core app depends on an AI service, and any future feature should stay optional. Generated phrases can enter through `createPhrase` or the importers, and new recordings through `updatePhrase` or the audio ZIP path, which already enforce exact IDs. Since the app has no backend, a provider key must never be built into the frontend. Generation belongs in local scripts, as with the current audio pipeline, or behind a key the user enters and stores on their own device.
