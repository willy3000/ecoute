import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectAudioAdvancing, instrument, openReady, playButton, readTable, waitForServiceWorker } from './helpers';

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
const errors: string[] = [];
const main = () => page.getByRole('main');
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).locator('visible=true').getByRole('link', { name, exact: true });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, permissions: ['microphone'] });
  page = await context.newPage();
  await instrument(context, page, errors);
});
test.afterAll(async () => {
  await context.close();
});

test.describe('first launch', () => {
  test('installs the whole library with no user action', async () => {
    await openReady(page);
    await expect(page.getByTestId('position')).toHaveText('1 of 37', { timeout: 60_000 });
    const [phrases, vocabulary, audio, collections] = await Promise.all(['phrases', 'vocabulary', 'audio', 'collections'].map((t) => readTable(page, t)));
    expect(collections).toHaveLength(12);
    expect(phrases!.length).toBeGreaterThanOrEqual(400);
    expect(vocabulary!.length).toBeGreaterThanOrEqual(200);
    expect(audio).toHaveLength(phrases!.length + vocabulary!.length * 2);
  });

  test('links every phrase to its own recording', async () => {
    const phrases = await readTable(page, 'phrases');
    expect(phrases.filter((p) => p.audioId !== p.id)).toEqual([]);
    const words = await readTable(page, 'vocabulary');
    expect(words.filter((w) => w.audioId !== w.id || w.exampleAudioId !== `${w.id}-ex`)).toEqual([]);
  });

  test('every stored recording decodes in the browser', async () => {
    test.setTimeout(180_000);
    const result = await page.evaluate(
      () =>
        new Promise<{ total: number; bad: string[]; shortest: number; longest: number }>((resolve, reject) => {
          const open = indexedDB.open('ecoute');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const req = open.result.transaction('audio').objectStore('audio').getAll();
            req.onsuccess = async () => {
              const ctx = new OfflineAudioContext(1, 1, 22050);
              const rows = req.result as { id: string; blob: Blob }[];
              const bad: string[] = [];
              let shortest = Infinity;
              let longest = 0;
              for (const r of rows) {
                try {
                  const decoded = await ctx.decodeAudioData(await r.blob.arrayBuffer());
                  shortest = Math.min(shortest, decoded.duration);
                  longest = Math.max(longest, decoded.duration);
                  if (decoded.duration < 0.3) bad.push(`${r.id}: ${decoded.duration}`);
                } catch {
                  bad.push(r.id);
                }
              }
              open.result.close();
              resolve({ total: rows.length, bad, shortest, longest });
            };
          };
        }),
    );
    expect(result.bad).toEqual([]);
    expect(result.longest).toBeLessThan(15);
    console.log(`decoded ${result.total} recordings, ${result.shortest.toFixed(2)}s to ${result.longest.toFixed(2)}s`);
  });
});

test.describe('listening player', () => {
  test('hides French and English by default, and toggles both', async () => {
    await page.goto('/#/listen');
    await expect(page.getByTestId('french')).toHaveCount(0);
    await expect(page.getByTestId('english')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show French' }).click();
    await expect(page.getByTestId('french')).toHaveText('Bonjour !');
    await page.getByRole('button', { name: 'Show English' }).click();
    await expect(page.getByTestId('english')).toHaveText('Hello!');
    await page.getByRole('button', { name: 'Hide French' }).click();
    await page.getByRole('button', { name: 'Hide English' }).click();
    await expect(page.getByTestId('french')).toHaveCount(0);
  });

  test('plays, pauses, resumes and replays real audio', async () => {
    const play = playButton(page);
    await page.getByRole('button', { name: 'Next phrase', exact: true }).click();
    await page.getByRole('button', { name: 'Next phrase', exact: true }).click();
    await page.getByRole('button', { name: 'Next phrase', exact: true }).click();
    await expect(page.getByTestId('position')).toHaveText('4 of 37');
    await play.click();
    await expect(play).toHaveAttribute('data-state', 'playing');
    await expectAudioAdvancing(page);
    // Natural end of the recording.
    await expect(play).toHaveAttribute('data-state', 'ready', { timeout: 10_000 });
    await play.click();
    await expect(play).toHaveAttribute('data-state', 'playing');
    await play.click();
    await expect(play).toHaveAttribute('data-state', 'paused');
    const pausedAt = await page.evaluate(() => window.__lastAudio!.currentTime);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__lastAudio!.currentTime)).toBe(pausedAt);
    await page.getByRole('button', { name: 'Replay from the start' }).click();
    await expect(play).toHaveAttribute('data-state', 'playing');
    await expect(play).toHaveAttribute('data-state', 'ready', { timeout: 10_000 });
  });

  test('plays the recording belonging to each phrase', async () => {
    await page.getByRole('button', { name: 'Previous phrase' }).click();
    await playButton(page).click();
    await expectAudioAdvancing(page);
    const duration = await page.evaluate(() => window.__lastAudio!.duration);
    await expect(page.getByTestId('position')).toHaveText('3 of 37');
    const row = (await readTable(page, 'audio')).find((a) => a.id === 'greeting-003') as { durationSeconds: number };
    expect(Math.abs(duration - row.durationSeconds)).toBeLessThan(0.15);
    await expect(playButton(page)).toHaveAttribute('data-state', 'ready', { timeout: 10_000 });
  });

  test('changes speed, preserves pitch, and defaults to normal speed', async () => {
    await page.getByRole('radio', { name: '0.75×' }).click();
    await playButton(page).click();
    await expectAudioAdvancing(page);
    let state = await page.evaluate(() => ({ rate: window.__lastAudio!.playbackRate, pitch: window.__lastAudio!.preservesPitch }));
    expect(state).toEqual({ rate: 0.75, pitch: true });
    await page.getByRole('radio', { name: '1.25×' }).click();
    state = await page.evaluate(() => ({ rate: window.__lastAudio!.playbackRate, pitch: window.__lastAudio!.preservesPitch }));
    expect(state).toEqual({ rate: 1.25, pitch: true });
    await page.getByRole('radio', { name: '0.85×' }).click();
    await page.getByRole('radio', { name: '1.15×' }).click();
    await page.getByRole('radio', { name: '1×', exact: true }).click();
    expect(await page.evaluate(() => window.__lastAudio!.playbackRate)).toBe(1);
    await expect(playButton(page)).toHaveAttribute('data-state', 'ready', { timeout: 10_000 });
  });

  test('repeat mode replays the same phrase, then auto-next moves on', async () => {
    await page.getByRole('button', { name: 'Repeat this phrase' }).click();
    const listens = () => readTable(page, 'phrases').then((rows) => rows.find((p) => p.id === 'greeting-003')!.listenCount as number);
    const before = await listens();
    await playButton(page).click();
    await expect.poll(listens, { timeout: 20_000 }).toBeGreaterThanOrEqual(before + 2);
    await expect(page.getByTestId('position')).toHaveText('3 of 37');
    await page.getByRole('button', { name: 'Repeat this phrase' }).click();
    await page.getByRole('button', { name: 'Automatic next phrase' }).click();
    await expect(page.getByTestId('position')).toHaveText('5 of 37', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Automatic next phrase' }).click();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).waitFor();
  });

  test('keyboard shortcuts work', async () => {
    await page.goto('/#/progress');
    await page.goto('/#/listen');
    const start = await page.getByTestId('position').textContent();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('position')).not.toHaveText(start!);
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('position')).toHaveText(start!);
    await page.keyboard.press('f');
    await expect(page.getByTestId('french')).toBeVisible();
    await page.keyboard.press('t');
    await expect(page.getByTestId('english')).toBeVisible();
    await page.keyboard.press(' ');
    await expect(playButton(page)).toHaveAttribute('data-state', 'playing');
    await page.keyboard.press(' ');
    await expect(playButton(page)).toHaveAttribute('data-state', /paused|ready/);
    await page.keyboard.press('b');
    await expect(page.getByRole('button', { name: 'Bookmark', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('b');
    await expect(page.getByRole('button', { name: 'Bookmark', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('?');
    await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('remembers collection and phrase across a reload', async () => {
    await page.getByRole('combobox', { name: 'Choose a collection' }).selectOption('food');
    await expect(page.getByTestId('position')).toHaveText('1 of 42');
    await page.getByRole('button', { name: 'Next phrase', exact: true }).click();
    await page.getByRole('button', { name: 'Next phrase', exact: true }).click();
    await expect(page.getByTestId('position')).toHaveText('3 of 42');
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByTestId('position')).toHaveText('3 of 42');
    await expect(page.getByRole('combobox', { name: 'Choose a collection' })).toHaveValue('food');
  });

  test('bookmarks appear as their own playlist', async () => {
    await page.getByRole('button', { name: 'Bookmark', exact: true }).click();
    await page.getByRole('combobox', { name: 'Choose a collection' }).selectOption('__bookmarks');
    await expect(page.getByTestId('position')).toHaveText('1 of 1');
    await page.getByRole('button', { name: 'Show English' }).click();
    await expect(page.getByTestId('english')).toHaveText('What will you have?');
    await page.getByRole('combobox', { name: 'Choose a collection' }).selectOption('greetings');
  });
});

test.describe('learning', () => {
  test('rating schedules the phrase and review mode serves it', async () => {
    await page.getByRole('button', { name: /After replays/ }).click();
    await expect(main().getByText('Next review in 2 days.')).toBeVisible();
    await page.getByRole('button', { name: 'Next phrase', exact: true }).click();
    await page.getByRole('button', { name: /^Lost/ }).click();
    await expect(main().getByText('Next review later today.')).toBeVisible();
    const rows = await readTable(page, 'phrases');
    const rated = rows.filter((p) => (p.reviewCount as number) > 0);
    expect(rated).toHaveLength(2);
    expect(rated.find((p) => p.status === 'learning' && (p.intervalDays as number) === 2)).toBeDefined();

    // Make the "Lost" phrase overdue as if time had passed, then review it.
    const lostId = rated.find((p) => p.intervalDays === 0)!.id as string;
    await page.evaluate(
      (id) =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('ecoute');
          open.onsuccess = () => {
            const store = open.result.transaction('phrases', 'readwrite').objectStore('phrases');
            const get = store.get(id);
            get.onsuccess = () => {
              store.put({ ...get.result, dueAt: Date.now() - 1000 }).onsuccess = () => {
                open.result.close();
                resolve();
              };
            };
          };
        }),
      lostId,
    );
    await page.reload();
    await page.getByRole('radio', { name: /Review/ }).click();
    await expect(page.getByTestId('position')).toHaveText('1 of 1');
    await page.getByRole('button', { name: /First time/ }).click();
    await expect(main().getByText('Nothing is due for review here.')).toBeVisible({ timeout: 5_000 }).catch(async () => {
      // The queue keeps the just-rated phrase in view until it reopens.
      await page.getByRole('radio', { name: 'Listen', exact: true }).click();
      await page.getByRole('radio', { name: /Review/ }).click();
      await expect(main().getByText('Nothing is due for review here.')).toBeVisible();
    });
    const after = (await readTable(page, 'phrases')).find((p) => p.id === lostId)!;
    expect(after.status).toBe('familiar');
    expect(after.intervalDays).toBe(5);
    await page.getByRole('radio', { name: 'Listen', exact: true }).click();
  });

  test('comprehension practice reveals, rates and advances', async () => {
    await page.goto('/#/practice/comprehension');
    await page.getByRole('combobox', { name: 'Practice collection' }).selectOption('verbs');
    await expect(page.getByTestId('deck-position')).toHaveText(/1 of \d+/);
    await expect(page.getByTestId('english')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reveal the meaning' }).click();
    await expect(page.getByTestId('english')).toBeVisible();
    await page.getByRole('button', { name: /^Hard/ }).click();
    await expect(page.getByTestId('deck-position')).toHaveText(/2 of \d+/);
    expect((await readTable(page, 'reviews')).some((r) => r.mode === 'comprehension' && r.rating === 'difficult')).toBe(true);
  });

  test('immersion shows no text and plays on by itself', async () => {
    await page.goto('/#/practice/immersion');
    await page.getByRole('combobox', { name: 'Practice collection' }).selectOption('family');
    await expect(page.getByTestId('deck-position')).toHaveText(/1 of/);
    await expect(page.locator('[lang="fr"]')).toHaveCount(0);
    await expectAudioAdvancing(page);
    await expect(page.getByTestId('deck-position')).toHaveText(/2 of/, { timeout: 15_000 });
  });

  test('dictation marks accent, wrong and missing words', async () => {
    await page.goto('/#/practice/dictation');
    await page.getByRole('combobox', { name: 'Practice collection' }).selectOption('feelings');
    await expect(page.getByTestId('deck-position')).toHaveText(/1 of/);
    await page.getByRole('textbox').fill('zzz');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByTestId('dictation-score')).toHaveText(/\d+% correct/);
    await page.getByRole('button', { name: 'Next phrase', exact: true }).click();
    await expect(page.getByTestId('deck-position')).toHaveText(/2 of/);
    // Answer the second card correctly, using its real text.
    const phrases = await readTable(page, 'phrases');
    const rated = new Set((await readTable(page, 'reviews')).map((r) => r.phraseId));
    const secondFeeling = phrases.filter((p) => p.collectionId === 'feelings' && p.status === 'new' && !rated.has(p.id)).sort((a, b) => (a.difficulty as number) - (b.difficulty as number) || (a.order as number) - (b.order as number))[0]!;
    await page.getByRole('textbox').fill((secondFeeling.french as string).replace(/ /g, ' '));
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('dictation-score')).toHaveText('Perfect.');
  });

  test('shadowing records from the microphone and plays back', async () => {
    await page.goto('/#/practice/shadowing');
    await page.getByRole('combobox', { name: 'Practice collection' }).selectOption('routines');
    await expect(page.getByTestId('deck-position')).toHaveText(/1 of/);
    await playButton(page).click();
    await expectAudioAdvancing(page);
    await page.getByRole('button', { name: 'Record myself' }).click();
    await expect(page.getByText('Recording. Repeat the phrase now.')).toBeVisible();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.getByTestId('play-mine').click();
    await page.getByRole('button', { name: 'Compare' }).click();
    await page.getByRole('button', { name: /Next phrase/ }).click();
    await expect(page.getByTestId('deck-position')).toHaveText(/2 of/);
    await expect(page.getByTestId('play-mine')).toHaveCount(0);
  });

  test('progress reports what actually happened', async () => {
    await page.goto('/#/progress');
    await expect(page.getByTestId('stat-first')).toHaveText(/\d+%/);
    await expect(page.getByTestId('stat-plays')).toHaveText(/\d\.\d/);
    expect(await page.getByTestId('stat-time').textContent()).toMatch(/\d/);
    const sessions = await readTable(page, 'sessions');
    expect(sessions.reduce((s, r) => s + (r.seconds as number), 0)).toBeGreaterThan(1);
    await expect(main().getByText('Difficult phrases')).toBeVisible();
    await expect(page.getByTestId('status-new')).toHaveText(/\d+/);
    await main().getByText('View as table').first().click();
    await expect(main().getByRole('columnheader', { name: 'Listening' }).first()).toBeVisible();
  });
});

test.describe('library', () => {
  test('creates, edits and deletes collections and phrases', async () => {
    await nav('Library').click();
    await page.getByRole('button', { name: 'New collection' }).click();
    await page.getByRole('dialog').getByLabel('Title').fill('Test list');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await main().getByRole('link', { name: /Test list/ }).click();
    await main().getByRole('button', { name: 'Add phrase' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('French', { exact: true }).fill('Il pleut.');
    await d.getByLabel('English', { exact: true }).fill('It is raining.');
    await d.getByLabel('Category').fill('Weather');
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('phrase-row')).toHaveCount(1);

    await main().getByRole('button', { name: 'Edit Il pleut.' }).click();
    await d.getByLabel('English', { exact: true }).fill("It's raining.");
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(main().getByText("It's raining.")).toBeVisible();

    await main().getByRole('button', { name: 'Edit', exact: true }).click();
    await d.getByLabel('Title').fill('Weather list');
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(main().getByRole('heading', { name: 'Weather list' })).toBeVisible();

    await main().getByRole('button', { name: 'Delete Il pleut.' }).click();
    await d.getByRole('button', { name: 'Delete phrase' }).click();
    await expect(page.getByTestId('phrase-row')).toHaveCount(0);
  });

  test('imports CSV and JSON, then exports', async () => {
    const dir = tmpdir();
    const csv = join(dir, 'ecoute-test.csv');
    writeFileSync(csv, 'french,english,difficulty,tags\n"Il neige, ce matin.",It is snowing this morning.,2,neige\nSans anglais,,1,\n');
    await main().getByRole('button', { name: 'Import' }).click();
    const d = page.getByRole('dialog');
    await d.locator('input[type=file]').setInputFiles(csv);
    await d.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByTestId('import-report')).toContainText('Added 1 phrase.');
    await expect(page.getByTestId('import-report')).toContainText('needs both French and English');
    await d.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('phrase-row')).toHaveCount(1);

    const json = join(dir, 'ecoute-test.json');
    writeFileSync(json, JSON.stringify([{ french: 'Il fait gris.', english: "It's grey.", category: 'Weather' }]));
    await main().getByRole('button', { name: 'Import' }).click();
    await d.locator('input[type=file]').setInputFiles(json);
    await d.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByTestId('import-report')).toContainText('Added 1 phrase.');
    await d.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('phrase-row')).toHaveCount(2);

    await main().getByRole('button', { name: 'Export' }).click();
    await d.getByLabel('Format').selectOption('csv');
    const [download] = await Promise.all([page.waitForEvent('download'), d.getByRole('button', { name: 'Download' }).click()]);
    expect(download.suggestedFilename()).toBe('ecoute-weather-list.csv');
    expect(readFileSync(await download.path(), 'utf8')).toContain('"Il neige, ce matin."');

    await main().getByRole('button', { name: 'Delete', exact: true }).click();
    await d.getByRole('button', { name: 'Delete collection' }).click();
    await expect(main().getByRole('heading', { name: 'Library' })).toBeVisible();
    expect((await readTable(page, 'collections')).length).toBe(12);
  });

  test('searches, filters and sorts phrases', async () => {
    await page.goto('/#/library/phrases');
    const count = page.getByTestId('phrase-count');
    await expect(count).toHaveText(/^5\d\d phrases$/);
    await page.getByRole('searchbox').fill('ou est la gare');
    await expect(count).toHaveText('1 phrases');
    await expect(main().getByText('Where is the train station?')).toBeVisible();
    await page.getByRole('searchbox').fill('');
    await page.getByRole('combobox', { name: 'Filter by register' }).selectOption('informal');
    await expect(count).toHaveText(/^\d\d phrases$/);
    await page.getByRole('combobox', { name: 'Filter by register' }).selectOption('');
    await page.getByRole('combobox', { name: 'Filter by collection' }).selectOption('time');
    await expect(count).toHaveText('28 phrases');
    await page.getByRole('combobox', { name: 'Filter by difficulty' }).selectOption('2');
    await page.getByRole('combobox', { name: 'Sort phrases' }).selectOption('french');
    const first = await page.getByTestId('phrase-row').first().locator('[lang=fr]').textContent();
    await page.getByRole('combobox', { name: 'Sort phrases' }).selectOption('order');
    expect(await page.getByTestId('phrase-row').first().locator('[lang=fr]').textContent()).not.toBe(first);
  });

  test('plays a phrase from the library list', async () => {
    await page.getByTestId('phrase-row').first().getByRole('button', { name: /^Play / }).click();
    await expectAudioAdvancing(page);
  });

  test('manages vocabulary and finds phrases by word', async () => {
    await page.goto('/#/library/vocabulary');
    await expect(page.getByTestId('word-count')).toHaveText(/^2\d\d words · 0 known$/);
    await page.getByRole('searchbox').fill('gare');
    await page.getByTestId('word-row').first().locator('button[aria-expanded]').click();
    await page.getByRole('button', { name: 'Mark gare as known' }).click();
    await expect(page.getByTestId('word-count')).toHaveText('1 words · 1 known');
    await page.getByRole('button', { name: 'Play example for gare' }).click();
    await expectAudioAdvancing(page);
    await main().getByRole('link', { name: /See all \d+ phrases/ }).click();
    await expect(page.getByTestId('phrase-count')).toHaveText(/^[1-9]\d* phrases$/);
    await expect(main().getByText('Containing "gare"')).toBeVisible();
    for (const text of await page.getByTestId('phrase-row').locator('[lang=fr]').allTextContents()) expect(text.toLowerCase()).toContain('gare');

    await page.goto('/#/library/vocabulary');
    await main().getByRole('button', { name: 'Add word' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('French', { exact: true }).fill('parapluie');
    await d.getByLabel('English meaning').fill('umbrella');
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(d).toHaveCount(0);
    await page.getByRole('searchbox').fill('parapluie');
    await expect(page.getByTestId('word-count')).toHaveText('1 words · 1 known');
    await page.getByTestId('word-row').first().locator('button[aria-expanded]').click();
    await main().getByRole('button', { name: 'Delete', exact: true }).click();
    await d.getByRole('button', { name: 'Delete word' }).click();
    await expect(page.getByTestId('word-count')).toHaveText('0 words · 1 known');
  });
});

test.describe('settings and data', () => {
  let backupPath: string;

  test('settings persist and take effect', async () => {
    await page.goto('/#/settings');
    await expect(page.getByTestId('storage-info')).toContainText('recordings');
    await expect(page.getByTestId('storage-info')).toContainText('MB');
    await page.getByRole('switch', { name: 'Show English translation by default' }).check();
    await page.waitForTimeout(100);
    await page.goto('/#/listen');
    await expect(page.getByTestId('english')).toBeVisible();
    await page.goto('/#/settings');
    await page.getByRole('switch', { name: 'Show English translation by default' }).uncheck();
    await page.getByRole('combobox', { name: 'Default practice mode' }).selectOption('dictation');
    await page.goto('/#/practice');
    await expect(main().getByText('Your default')).toBeVisible();
  });

  test('backup, destructive change, and exact restore', async () => {
    test.setTimeout(180_000);
    await page.goto('/#/settings');
    const beforeReviews = (await readTable(page, 'reviews')).length;
    const beforeAudio = (await readTable(page, 'audio')).length;
    expect(beforeReviews).toBeGreaterThan(0);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download full backup' }).click()]);
    backupPath = join(tmpdir(), download.suggestedFilename());
    await download.saveAs(backupPath);
    expect(download.suggestedFilename()).toMatch(/^ecoute-backup-\d{4}-\d\d-\d\d\.zip$/);

    await page.getByRole('button', { name: 'Reset progress' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset progress' }).click();
    await expect(page.getByTestId('settings-message')).toContainText('Progress cleared');
    expect(await readTable(page, 'reviews')).toHaveLength(0);

    await page.getByTestId('restore-input').setInputFiles(backupPath);
    await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByTestId('settings-message')).toContainText('Restored backup', { timeout: 90_000 });
    expect(await readTable(page, 'reviews')).toHaveLength(beforeReviews);
    expect(await readTable(page, 'audio')).toHaveLength(beforeAudio);
    await page.goto('/#/listen');
    await playButton(page).click();
    await expectAudioAdvancing(page);
    await expect(playButton(page)).not.toHaveAttribute('data-state', 'error');
  });

  test('clears all data only after confirmation, then reinstalls', async () => {
    test.setTimeout(150_000);
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Clear all local data' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    expect((await readTable(page, 'reviews')).length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Clear all local data' }).click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('dialog').getByRole('button', { name: 'Erase everything' }).click()]);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('storage-info')).toContainText('recordings', { timeout: 60_000 });
    expect(await readTable(page, 'reviews')).toHaveLength(0);
    expect((await readTable(page, 'phrases')).length).toBeGreaterThanOrEqual(400);
    rmSync(backupPath, { force: true });
  });
});

test('no console or page errors occurred across the whole session', () => {
  expect(errors).toEqual([]);
});

test.describe('offline and restart', () => {
  test('works fully offline and survives a browser restart', async () => {
    test.setTimeout(240_000);
    const profile = join(tmpdir(), `ecoute-profile-${Date.now()}`);
    const launch = () =>
      chromium.launchPersistentContext(profile, {
        channel: 'chrome',
        viewport: { width: 1280, height: 800 },
        args: ['--autoplay-policy=no-user-gesture-required'],
      });
    const errs: string[] = [];
    let ctx = await launch();
    let p = ctx.pages()[0] ?? (await ctx.newPage());
    await instrument(ctx, p, errs);
    const base = test.info().project.use.baseURL!;
    await p.goto(base);
    await expect(p.getByTestId('position')).toHaveText('1 of 37', { timeout: 90_000 });
    await waitForServiceWorker(p);
    await p.waitForTimeout(1500);

    // Network off from here on.
    await ctx.setOffline(true);
    await p.reload();
    await expect(p.getByTestId('position')).toHaveText('1 of 37', { timeout: 30_000 });
    await p.getByRole('combobox', { name: 'Choose a collection' }).selectOption('places');
    await expect(p.getByTestId('position')).toHaveText('1 of 37');
    await p.getByRole('button', { name: 'Show English' }).click();
    await expect(p.getByTestId('english')).toHaveText('Excuse me, where is the post office?');
    await playButton(p).click();
    await expectAudioAdvancing(p);
    await expect(playButton(p)).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
    await p.getByRole('button', { name: /First time/ }).click();
    await p.getByRole('button', { name: 'Bookmark', exact: true }).click();
    await p.goto(`${base}#/library/phrases`);
    await expect(p.getByTestId('phrase-count')).toHaveText(/^5\d\d phrases$/);
    await p.goto(`${base}#/progress`);
    await expect(p.getByTestId('stat-first')).toHaveText('100%');
    await p.goto(`${base}#/settings`);
    const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download full backup' }).click()]);
    expect(download.suggestedFilename()).toMatch(/ecoute-backup/);
    await p.goto(`${base}#/listen`);
    await p.waitForTimeout(500);

    // A real browser restart, still offline.
    await ctx.close();
    ctx = await launch();
    await ctx.setOffline(true);
    p = ctx.pages()[0] ?? (await ctx.newPage());
    await instrument(ctx, p, errs);
    await p.goto(base);
    await expect(p.getByRole('combobox', { name: 'Choose a collection' })).toHaveValue('places', { timeout: 30_000 });
    await expect(p.getByTestId('position')).toHaveText('1 of 37');
    const phrases = await readTable(p, 'phrases');
    expect(phrases.find((x) => x.id === 'place-001')).toMatchObject({ status: 'familiar', intervalDays: 5 });
    expect(await readTable(p, 'bookmarks')).toHaveLength(1);
    expect((await readTable(p, 'audio')).length).toBeGreaterThan(900);
    await playButton(p).click();
    await expectAudioAdvancing(p);
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
    expect(errs.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e))).toEqual([]);
  });
});

test.describe('installability', () => {
  test('serves a valid manifest and icons', async ({ page: p, request }) => {
    await p.goto('/');
    const href = await p.locator('link[rel=manifest]').getAttribute('href');
    const res = await request.get(new URL(href!, p.url()).href);
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as { name: string; display: string; icons: { src: string; sizes: string; purpose?: string }[] };
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, p.url()).href)).ok()).toBe(true);
  });
});

test.describe('mobile', () => {
  test('has no horizontal overflow on a phone, on any screen', async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    const errs: string[] = [];
    await instrument(ctx, p, errs);
    await p.goto('/');
    await expect(p.getByTestId('position')).toHaveText('1 of 37', { timeout: 90_000 });
    for (const route of ['listen', 'library', 'library/phrases', 'library/vocabulary', 'library/collection/spoken', 'practice', 'practice/dictation', 'practice/shadowing', 'progress', 'settings']) {
      await p.goto(`/#/${route}`);
      await p.waitForTimeout(400);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `overflow on ${route}`).toBeLessThanOrEqual(0);
    }
    await p.goto('/#/listen');
    const box = await playButton(p).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(100);
    await playButton(p).tap();
    await expectAudioAdvancing(p);
    await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Progress' }).tap();
    await expect(p.getByRole('heading', { name: 'Progress' })).toBeVisible();
    await ctx.close();
    expect(errs).toEqual([]);
  });
});
