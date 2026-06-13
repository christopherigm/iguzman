import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext } from 'playwright';
import { loadNetscapeCookies } from './cookies';

chromium.use(StealthPlugin());

let browser: Browser | null = null;

/**
 * Returns a shared, warm Browser instance.
 * Automatically restarts the browser if it has crashed or been closed.
 */
export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;

  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // required in Docker (low /dev/shm)
      '--disable-gpu',
    ],
  });

  browser.on('disconnected', () => {
    browser = null;
  });

  return browser;
}

/**
 * Creates a new isolated BrowserContext with the Netscape cookies
 * pre-loaded. Callers must close the context when done.
 */
export async function newContext(): Promise<BrowserContext> {
  const b = await getBrowser();
  const context = await b.newContext();

  const cookies = loadNetscapeCookies();
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }

  return context;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}
