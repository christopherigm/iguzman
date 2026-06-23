import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
} from "playwright";
import { loadNetscapeCookies } from "./cookies";

chromium.use(StealthPlugin());

let browser: Browser | null = null;

/**
 * Returns a shared, warm Browser instance.
 * Automatically restarts the browser if it has crashed or been closed.
 */
export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;

  // playwright-extra resolves its own (older) playwright-core copy as an
  // optional peer, so the launched Browser is typed against a sibling version
  // of the types. It is the same runtime object, so cast it to the `playwright`
  // Browser type used throughout the rest of the app.
  browser = (await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // required in Docker (low /dev/shm)
      "--disable-gpu",
    ],
  })) as unknown as Browser;

  browser.on("disconnected", () => {
    browser = null;
  });

  return browser;
}

/**
 * Creates a new isolated BrowserContext with the Netscape cookies
 * pre-loaded. Callers must close the context when done.
 */
export async function newContext(
  options?: BrowserContextOptions,
): Promise<BrowserContext> {
  const b = await getBrowser();
  const context = await b.newContext(options);

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
