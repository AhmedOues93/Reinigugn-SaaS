/**
 * Die Seite, auf der der Browserlauf stattfindet.
 *
 * Kein Next-Server: diese Suite prueft die Warteschlange auf dem Geraet, und
 * die haengt an IndexedDB und nicht am Rendern. Ein Build waere eine Minute
 * Wartezeit fuer nichts. Darum eine leere Seite auf einem erfundenen Ursprung,
 * mit `page.route` ausgeliefert -- ein eigener Ursprung ist noetig, weil
 * IndexedDB daran haengt und `about:blank` keinen hat.
 */
import { resolve } from 'node:path';
import { build } from 'esbuild';
import type { BrowserContext, Page } from '@playwright/test';

/** Erfundener Ursprung: nichts wird dorthin gesendet, `route` antwortet. */
export const ORIGIN = 'https://field-app.test';

let cached: string | null = null;

/**
 * Baut `browser-entry.ts` samt `lib/offline` zu einem Skript.
 *
 * Einmal pro Lauf, denn es sind wenige Millisekunden, aber jede Seite braucht
 * es erneut.
 */
export async function offlineBundle(): Promise<string> {
  if (cached) return cached;
  const result = await build({
    entryPoints: [resolve(__dirname, 'browser-entry.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'chrome120',
    alias: { '@': resolve(__dirname, '../../..') },
    logLevel: 'silent',
  });
  cached = result.outputFiles[0].text;
  return cached;
}

/** Faengt den erfundenen Ursprung ab, damit nichts das Netz verlaesst. */
export async function serveBlankOrigin(context: BrowserContext) {
  await context.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>field app</title>' }),
  );
}

/** Oeffnet die Seite und legt `window.Offline` und das Servermodell darauf. */
export async function openFieldApp(page: Page) {
  await page.goto(`${ORIGIN}/mitarbeiter`);
  await page.addScriptTag({ content: await offlineBundle() });
}
