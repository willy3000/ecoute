# Écoute user guide

Écoute is built around one habit: listen first, understand naturally, repeat until fluent.

## Your first session

1. Open the app. The Listen screen is ready with the first collection.
2. Press the large play button and listen. The French and English stay hidden.
3. Replay as often as you like, then press **Show French** or **Show English** to check yourself.
4. Move on with the next button. If you want, rate how well you understood.

Rating is optional. You can listen for hours without rating anything.

## Listen

**Listen mode** plays a collection in order and remembers your place in each collection. **Review mode** plays only phrases that are due, based on your ratings.

| Control | What it does |
|---|---|
| Play and pause | Starts or pauses the recording |
| Replay | Restarts from the beginning |
| Repeat | Keeps replaying this phrase, with a short pause between plays |
| Automatic next | Moves through the collection by itself |
| Bookmark | Saves the phrase to the "Bookmarked phrases" list in the collection menu |
| Speed | 0.75× to 1.25×, with pitch preserved. 1× is the natural speed |

To listen hands-free, turn on **Automatic next** and press play. You can change the pause between phrases in Settings.

### Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play or pause |
| R | Replay |
| ← and → | Previous or next phrase |
| F and T | Show or hide French, show or hide English |
| L | Repeat this phrase |
| A | Automatic next |
| S | Next speed |
| B | Bookmark |
| 1, 2, 3, 4 | Rate understanding |
| ? | Show this list |

## Ratings and reviews

| Rating | Meaning | Comes back |
|---|---|---|
| Lost | You didn't understand it | Later in this session |
| Hard | You understood with real difficulty | Tomorrow |
| After replays | You understood after hearing it again | In 2 to 3 days |
| First time | You understood straight away | In 5 to 7 days, stretching to 30 days as you keep getting it |

Phrases move through New, Learning, Difficult, Familiar and Mastered as you rate them. A phrase counts as mastered after three "First time" ratings in a row, and losing it again moves it back.

## Practice

Each session uses up to 20 phrases: those due for review first, then new ones, easiest first.

- **Immersion:** continuous audio with no text on screen.
- **Comprehension:** listen, reveal the meaning, and rate yourself.
- **Shadowing:** listen and repeat aloud. You can record yourself and compare with the original. Your recording stays on the page, is never saved or sent anywhere, and is discarded when you move on.
- **Dictation:** type what you hear, then see each word marked as an accent slip, wrong, extra or missing. Capital letters and punctuation are ignored. The result updates that phrase's review schedule.

## Library

**Collections** lists the 12 built-in collections and any of your own. **Phrases** searches everything, with filters for collection, status, difficulty, category and register. **Vocabulary** holds the word list. Open a word to see its pronunciation and example, mark it as known, or find every phrase that contains it.

"Natural spoken French" shows how people really talk. Informal entries carry an **Informal** badge and are linked to their standard written form.

### Adding your own phrases and recordings

Use **Add phrase** to enter a phrase and optionally attach an audio file. To add many at once, open a collection and choose **Import**:

| File | How it works |
|---|---|
| CSV | Needs `french` and `english` columns. Optional: `spoken_alternative`, `difficulty`, `category`, `tags`, `pronunciation_notes`, `register` |
| JSON | A list of phrases using `french`, `english` and the same optional fields, or an object with a `phrases` list |
| ZIP of recordings | Each file must be named with an exact phrase ID, such as `greeting-001.mp3`, or be mapped in a `manifest.json` containing `[{"id": "...", "file": "..."}]`. Anything else is skipped and listed in the report |

**Export** on a collection saves it as a ZIP with recordings, or as text-only CSV or JSON.

## Progress

Progress shows listening time, how often you understood a phrase the first time, how many plays you needed before rating, your status breakdown, daily and weekly activity, your hardest phrases, and the vocabulary you miss most.

## Backup and restore

Everything lives in this browser on this device, so a backup is your only safety net if the browser's data is cleared.

- **To back up:** go to Settings and choose **Download full backup**. The ZIP contains your library, recordings, progress and settings.
- **To restore or move to another device:** go to Settings and choose **Restore from file**. A full backup replaces everything currently on that device.
- **To restore only the built-in library:** choose **Restore starter library**. This needs a connection and keeps your progress and your own phrases. While offline, you can restore from a copy of `ecoute-audio-v1.zip` instead.

**Reset progress** erases ratings, history and bookmarks but keeps the library. **Clear all local data** erases everything, after which the starter library downloads again.

## Offline use and installing

After the first launch, everything works without a connection, including recordings, progress and backups. To install the app, use the install icon in the address bar in Chrome or Edge, or "Add to Home Screen" on a phone.
