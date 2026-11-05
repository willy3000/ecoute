import { expect, type BrowserContext, type Page } from '@playwright/test';

export type Row = Record<string, unknown>;

declare global {
  interface Window {
    __lastAudio?: HTMLAudioElement;
  }
}

/** Records real problems and exposes the app's audio element to the test. */
export async function instrument(context: BrowserContext, page: Page, errors: string[]): Promise<void> {
  await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      window.__lastAudio = this as HTMLAudioElement;
      return play.call(this);
    };
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
}

export async function openReady(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  // The navigation only renders once the library has finished installing.
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible({ timeout: 60_000 });
}

/** Waits until the service worker controls the page, so offline tests are meaningful. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30_000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  });
}

/** Reads rows straight from IndexedDB, independently of the app's own code. */
export function readTable(page: Page, table: string): Promise<Row[]> {
  return page.evaluate(
    (name) =>
      new Promise<Row[]>((resolve, reject) => {
        const open = indexedDB.open('ecoute');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction(name).objectStore(name).getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            db.close();
            resolve(req.result as Row[]);
          };
        };
      }),
    table,
  );
}

export const playButton = (page: Page) => page.getByRole('main').locator('button[data-state]').first();

/** Plays until the element has truly advanced, proving that audio is decoding. */
export async function expectAudioAdvancing(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const a = window.__lastAudio;
    return Boolean(a && a.currentTime > 0.05 && a.duration > 0 && a.error === null);
  });
}
