import { chromium, type Browser } from 'playwright';

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

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}
